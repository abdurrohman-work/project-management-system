import { SupabaseClient } from '@supabase/supabase-js'
import type { Database, MainTaskStatus, SprintTaskStatus } from '@/types/database'
import { recalculateAll } from '@/lib/calculations'

type TypedSupabaseClient = SupabaseClient<Database>

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Returns the id of the currently active sprint, or null if none exists.
 * Used by Rule D and Rule E to scope cascade to the active sprint only.
 */
async function getActiveSprintId(
  supabase: TypedSupabaseClient
): Promise<string | null> {
  const { data, error } = await supabase
    .from('sprints')
    .select('id')
    .eq('status', 'active')
    .maybeSingle()

  if (error) throw new Error(`getActiveSprintId: ${error.message}`)
  return data?.id ?? null
}

// ─── Rule A ───────────────────────────────────────────────────────────────────

/**
 * Rule A — sprint_task status → in_progress
 *
 * Auto-creates a workload_entry for the given sprint task if none exists.
 * Called whenever a sprint_task status is set to 'in_progress'.
 */
export async function ensureWorkloadEntry(
  sprintTaskId: string,
  supabase: TypedSupabaseClient
): Promise<void> {
  const { count, error: countError } = await supabase
    .from('workload_entries')
    .select('id', { count: 'exact', head: true })
    .eq('sprint_task_id', sprintTaskId)

  if (countError) throw new Error(`ensureWorkloadEntry (count): ${countError.message}`)

  if (count === 0) {
    const { error: insertError } = await supabase
      .from('workload_entries')
      .insert({
        sprint_task_id: sprintTaskId,
        status: 'not_started',
        planned_time: 0,
        actual_time: 0,
      })

    if (insertError) throw new Error(`ensureWorkloadEntry (insert): ${insertError.message}`)
  }
}

// ─── Rule B ───────────────────────────────────────────────────────────────────

/**
 * Rule B — sprint_task created or modified
 *
 * If the parent main_task is still in 'backlog', promotes it to 'in_progress'.
 * Called on every sprint_task create and patch.
 */
export async function promoteMainTaskIfBacklog(
  mainTaskId: string,
  supabase: TypedSupabaseClient
): Promise<void> {
  const { data: mainTask, error: fetchError } = await supabase
    .from('main_tasks')
    .select('id, status')
    .eq('id', mainTaskId)
    .single()

  if (fetchError) throw new Error(`promoteMainTaskIfBacklog (fetch): ${fetchError.message}`)

  if (mainTask.status === 'backlog') {
    const { error: updateError } = await supabase
      .from('main_tasks')
      .update({ status: 'in_progress' })
      .eq('id', mainTaskId)

    if (updateError) throw new Error(`promoteMainTaskIfBacklog (update): ${updateError.message}`)
  }
}

// ─── Rule C ───────────────────────────────────────────────────────────────────

/**
 * Rule C — all sprint_tasks for a main_task are done
 *
 * Fetches every sprint_task linked to this main_task across ALL sprints.
 * If every row has status 'done', sets the main_task status to 'done'.
 * If NOT all done and the main_task is currently 'done', reverts it to 'in_progress'
 * (mirrors original: updateMainDoneIfAllSprintTasksDone_ reverts done → in_progress).
 *
 * Guard: a main_task with zero sprint_tasks is never auto-completed.
 */
export async function completeMainTaskIfAllDone(
  mainTaskId: string,
  supabase: TypedSupabaseClient
): Promise<void> {
  const { data: sprintTasks, error: fetchError } = await supabase
    .from('sprint_tasks')
    .select('id, status')
    .eq('main_task_id', mainTaskId)

  if (fetchError) throw new Error(`completeMainTaskIfAllDone (fetch): ${fetchError.message}`)

  if (!sprintTasks || sprintTasks.length === 0) return

  const allDone = sprintTasks.every((t) => t.status === 'done')

  if (allDone) {
    const { error } = await supabase
      .from('main_tasks')
      .update({ status: 'done' })
      .eq('id', mainTaskId)
    if (error) throw new Error(`completeMainTaskIfAllDone (set done): ${error.message}`)
    return
  }

  // Not all done — if the main task is currently 'done', revert it to 'in_progress'.
  // This handles the case where a new sprint task is added after the task was completed,
  // or a done sprint task is re-opened.
  const { data: mainTask, error: fetchMainError } = await supabase
    .from('main_tasks')
    .select('status')
    .eq('id', mainTaskId)
    .single()

  if (fetchMainError) throw new Error(`completeMainTaskIfAllDone (fetch main): ${fetchMainError.message}`)

  if (mainTask.status === 'done') {
    const { error } = await supabase
      .from('main_tasks')
      .update({ status: 'in_progress' })
      .eq('id', mainTaskId)
    if (error) throw new Error(`completeMainTaskIfAllDone (revert to in_progress): ${error.message}`)
  }
}

// ─── Rule D ───────────────────────────────────────────────────────────────────

/**
 * Rule D — main_task → blocked or stopped
 *
 * Finds all non-done sprint_tasks for this main_task in the active sprint
 * and sets their status to match the main_task's new status ('blocked' or 'stopped').
 *
 * Scoped to the active sprint only — archived sprint tasks are left untouched.
 * No-op if there is no active sprint.
 *
 * @param mainTaskId - The main task being blocked or stopped
 * @param newStatus  - 'blocked' | 'stopped' — mirrored onto qualifying sprint_tasks
 */
export async function cascadeMainTaskBlock(
  mainTaskId: string,
  newStatus: Extract<MainTaskStatus, 'blocked' | 'stopped'>,
  supabase: TypedSupabaseClient
): Promise<void> {
  const activeSprintId = await getActiveSprintId(supabase)
  if (!activeSprintId) return

  const { error } = await supabase
    .from('sprint_tasks')
    .update({ status: newStatus as SprintTaskStatus })
    .eq('main_task_id', mainTaskId)
    .eq('sprint_id', activeSprintId)
    .neq('status', 'done')

  if (error) throw new Error(`cascadeMainTaskBlock (update): ${error.message}`)
}

// ─── Rule E ───────────────────────────────────────────────────────────────────

/**
 * Rule E — main_task → in_progress (from blocked/stopped)
 *
 * Finds all sprint_tasks in the active sprint for this main_task that are
 * currently 'blocked' or 'stopped' (i.e. were set by Rule D) and reverts
 * them to 'in_progress'.
 *
 * Also calls ensureWorkloadEntry (Rule A) for each reverted task, because
 * transitioning to 'in_progress' should always guarantee a workload_entry exists.
 *
 * Scoped to the active sprint only. No-op if there is no active sprint.
 *
 * @param mainTaskId - The main task being unblocked
 * @param prevStatus - The status it held before this transition (for documentation clarity)
 */
export async function cascadeMainTaskUnblock(
  mainTaskId: string,
  prevStatus: Extract<MainTaskStatus, 'blocked' | 'stopped'>,
  supabase: TypedSupabaseClient
): Promise<void> {
  void prevStatus // informational — filter targets both 'blocked' and 'stopped'

  const activeSprintId = await getActiveSprintId(supabase)
  if (!activeSprintId) return

  // Fetch the sprint_tasks that Rule D previously blocked/stopped.
  const { data: affectedTasks, error: fetchError } = await supabase
    .from('sprint_tasks')
    .select('id')
    .eq('main_task_id', mainTaskId)
    .eq('sprint_id', activeSprintId)
    .in('status', ['blocked', 'stopped'])

  if (fetchError) throw new Error(`cascadeMainTaskUnblock (fetch): ${fetchError.message}`)
  if (!affectedTasks || affectedTasks.length === 0) return

  const affectedIds = affectedTasks.map((t) => t.id)

  // Revert all of them to in_progress in one query.
  const { error: updateError } = await supabase
    .from('sprint_tasks')
    .update({ status: 'in_progress' })
    .in('id', affectedIds)

  if (updateError) throw new Error(`cascadeMainTaskUnblock (update): ${updateError.message}`)

  // Rule A: guarantee a workload_entry exists for every task now in_progress.
  await Promise.all(
    affectedIds.map((id) => ensureWorkloadEntry(id, supabase))
  )
}

// ─── Orchestrators ────────────────────────────────────────────────────────────

/**
 * Called from POST /api/sprint-tasks after a new sprint_task is inserted.
 *
 * Applies: Rule B, then recalculates progress + time_spent.
 * A new sprint task changes the weight denominator, so progress must be recomputed.
 */
export async function onSprintTaskCreated(
  sprintTaskId: string,
  mainTaskId: string,
  supabase: TypedSupabaseClient
): Promise<void> {
  void sprintTaskId // reserved for future rule extensions
  await promoteMainTaskIfBacklog(mainTaskId, supabase) // Rule B
  await recalculateAll(mainTaskId, supabase)           // new task shifts weight denominator
}

/**
 * Called from PATCH /api/sprint-tasks/[id] after a sprint_task is updated.
 *
 * Applies in order:
 *   Rule A — if newStatus === 'in_progress'
 *   Rule B — always (any field modification counts)
 *   Rule C — always (checks all-done AND reverts done→in_progress if needed)
 *   recalculateAll — always (status change shifts done-weight in progress bar)
 *
 * Original always runs updateMainTimeSpent_ + updateMainProgressBar_ + updateMainDoneIfAllSprintTasksDone_
 * on every sprint task status change, not just when status === 'done'.
 *
 * @param sprintTaskId - The task that was patched
 * @param newStatus    - The status value from the patch body (undefined if status was not changed)
 * @param mainTaskId   - The parent main task id
 */
export async function onSprintTaskPatched(
  sprintTaskId: string,
  newStatus: SprintTaskStatus | undefined,
  mainTaskId: string,
  supabase: TypedSupabaseClient
): Promise<void> {
  if (newStatus === 'in_progress') {
    await ensureWorkloadEntry(sprintTaskId, supabase) // Rule A
  }

  await promoteMainTaskIfBacklog(mainTaskId, supabase)  // Rule B
  await completeMainTaskIfAllDone(mainTaskId, supabase) // Rule C (also reverts done→in_progress)
  await recalculateAll(mainTaskId, supabase)            // always recalc — any status change shifts progress
}

/**
 * Called from PATCH /api/main-tasks/[id] after a main_task status changes.
 *
 * Applies in order:
 *   Rule D — if newStatus is 'blocked' or 'stopped'
 *   Rule E — if newStatus is 'in_progress' and prevStatus was 'blocked' or 'stopped'
 *
 * @param mainTaskId - The main task that was patched
 * @param newStatus  - The status value after the patch
 * @param prevStatus - The status value before the patch
 */
export async function onMainTaskStatusChanged(
  mainTaskId: string,
  newStatus: MainTaskStatus,
  prevStatus: MainTaskStatus,
  supabase: TypedSupabaseClient
): Promise<void> {
  if (newStatus === 'blocked' || newStatus === 'stopped') {
    await cascadeMainTaskBlock(mainTaskId, newStatus, supabase) // Rule D
    return
  }

  if (
    newStatus === 'in_progress' &&
    (prevStatus === 'blocked' || prevStatus === 'stopped')
  ) {
    await cascadeMainTaskUnblock(mainTaskId, prevStatus, supabase) // Rule E
  }
}

/**
 * Called from POST /api/workload-entries, PATCH /api/workload-entries/[id],
 * and DELETE /api/workload-entries/[id] after any workload_entry mutation.
 *
 * Any change to a workload_entry (create, update, delete) can affect both
 * the progress weighting (planned_time) and time_spent (actual_time) of the
 * parent main task, so both are recalculated.
 *
 * @param mainTaskId - The parent main task id (resolved by the API route via
 *                     the sprint_task → main_task join before calling this)
 */
export async function onWorkloadEntryChanged(
  mainTaskId: string,
  supabase: TypedSupabaseClient
): Promise<void> {
  await recalculateAll(mainTaskId, supabase)
}
