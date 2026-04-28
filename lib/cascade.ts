import { SupabaseClient } from '@supabase/supabase-js'
import type { Database, MainTaskStatus, SprintTaskStatus, WorkloadStatus } from '@/types/database'
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
 * Ensures a workload_entry exists for the given sprint_task and that its
 * status is at least 'in_progress' once the parent task is active.
 *
 *   - No entry exists                        → create one with status 'not_started'
 *   - Entry exists with status 'not_started' → bump status to 'in_progress'
 *   - Entry exists with any other status     → leave untouched
 *
 * Implementation uses UPSERT with `ON CONFLICT (sprint_task_id) DO NOTHING`
 * (`ignoreDuplicates: true`) to avoid the count-then-insert race that could
 * create duplicate rows when this function is invoked concurrently. A unique
 * index on workload_entries.sprint_task_id (migration 005) backs the
 * ON CONFLICT clause. The follow-up UPDATE only touches rows that are still
 * 'not_started', so it is idempotent and never overwrites stronger statuses.
 */
export async function ensureWorkloadEntry(
  sprintTaskId: string,
  supabase: TypedSupabaseClient
): Promise<void> {
  // Insert when missing; do nothing if the entry already exists.
  const { error: upsertError } = await supabase
    .from('workload_entries')
    .upsert(
      {
        sprint_task_id: sprintTaskId,
        status:         'not_started',
        planned_time:   0,
        actual_time:    0,
      },
      { onConflict: 'sprint_task_id', ignoreDuplicates: true }
    )

  if (upsertError) throw new Error(`ensureWorkloadEntry (upsert): ${upsertError.message}`)

  // Bump 'not_started' → 'in_progress'. Filtered update is a no-op for rows
  // already in any other state, so this is safe to run after every upsert.
  const { error: updateError } = await supabase
    .from('workload_entries')
    .update({ status: 'in_progress' })
    .eq('sprint_task_id', sprintTaskId)
    .eq('status', 'not_started')

  if (updateError) throw new Error(`ensureWorkloadEntry (update): ${updateError.message}`)
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

// ─── Rule F ───────────────────────────────────────────────────────────────────

/**
 * Workload status → sprint_task status mapping.
 * halted maps to partly_completed (mirrors original behaviour).
 */
const WORKLOAD_TO_SPRINT_STATUS: Record<WorkloadStatus, SprintTaskStatus> = {
  not_started: 'not_started',
  in_progress: 'in_progress',
  done:        'done',
  stopped:     'stopped',
  blocked:     'blocked',
}

/**
 * Rule F — workload_entry status changes → propagate to sprint_task
 *
 * Strategy (mirrors original):
 *   1. If the sprint_task that owns this entry belongs to the ACTIVE sprint →
 *      update it directly.
 *   2. If the sprint_task is in an ARCHIVED sprint → find the sprint_task for
 *      the same main_task that lives in the active sprint and update that one.
 *   3. Fallback (no active sprint, or no active-sprint task for this main_task) →
 *      update the original sprint_task regardless of sprint.
 *
 * @param sprintTaskId   - The sprint_task that owns the workload_entry
 * @param workloadStatus - The new workload_entry status
 */
export async function propagateWorkloadStatusToSprintTask(
  sprintTaskId: string,
  workloadStatus: WorkloadStatus,
  supabase: TypedSupabaseClient
): Promise<void> {
  const newStatus = WORKLOAD_TO_SPRINT_STATUS[workloadStatus]

  // Fetch the owning sprint_task (need sprint_id + main_task_id)
  const { data: sprintTask, error: fetchError } = await supabase
    .from('sprint_tasks')
    .select('id, sprint_id, main_task_id')
    .eq('id', sprintTaskId)
    .single()

  if (fetchError) throw new Error(`propagateWorkloadStatusToSprintTask (fetch): ${fetchError.message}`)

  const activeSprintId = await getActiveSprintId(supabase)

  // Case 1: sprint_task is already in the active sprint → update directly
  if (activeSprintId && sprintTask.sprint_id === activeSprintId) {
    const { error } = await supabase
      .from('sprint_tasks')
      .update({ status: newStatus })
      .eq('id', sprintTaskId)
    if (error) throw new Error(`propagateWorkloadStatusToSprintTask (update active): ${error.message}`)
    return
  }

  // Case 2: sprint_task is archived — try to find one for the same main_task in the active sprint
  if (activeSprintId) {
    const { data: activeTask, error: activeFetchError } = await supabase
      .from('sprint_tasks')
      .select('id')
      .eq('main_task_id', sprintTask.main_task_id)
      .eq('sprint_id', activeSprintId)
      .maybeSingle()

    if (activeFetchError) throw new Error(`propagateWorkloadStatusToSprintTask (fetch active task): ${activeFetchError.message}`)

    if (activeTask) {
      const { error } = await supabase
        .from('sprint_tasks')
        .update({ status: newStatus })
        .eq('id', activeTask.id)
      if (error) throw new Error(`propagateWorkloadStatusToSprintTask (update via active): ${error.message}`)
      return
    }
  }

  // Case 3: Fallback — no active sprint or no active-sprint task for this main_task
  const { error } = await supabase
    .from('sprint_tasks')
    .update({ status: newStatus })
    .eq('id', sprintTaskId)
  if (error) throw new Error(`propagateWorkloadStatusToSprintTask (fallback): ${error.message}`)
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
 * Behaviour:
 *   - If workloadStatus is provided: runs Rule F (propagate status to sprint_task).
 *   - Always: recalculates progress and time_spent for the parent main task.
 *
 * @param mainTaskId     - The parent main task id (resolved via sprint_task → main_task join)
 * @param supabase       - Typed Supabase client
 * @param sprintTaskId   - (optional) The sprint_task that owns the entry; required for Rule F
 * @param workloadStatus - (optional) The new workload_entry status; required for Rule F
 */
export async function onWorkloadEntryChanged(
  mainTaskId: string,
  supabase: TypedSupabaseClient,
  sprintTaskId?: string,
  workloadStatus?: WorkloadStatus,
): Promise<void> {
  // Rule F: propagate workload status → sprint_task (active sprint preferred)
  if (sprintTaskId !== undefined && workloadStatus !== undefined) {
    await propagateWorkloadStatusToSprintTask(sprintTaskId, workloadStatus, supabase)
  }

  await recalculateAll(mainTaskId, supabase)
}
