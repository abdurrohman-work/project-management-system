import { SupabaseClient } from '@supabase/supabase-js'
import type { Database, MainTaskStatus, SprintTaskStatus } from '@/types/database'

type TypedSupabaseClient = SupabaseClient<Database>

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Returns the id of the currently active sprint, or null if none exists.
 * Used internally by Rule D / Rule E.
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
 * Rule A — sprint_task → in_progress
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
 * Called whenever a sprint_task is patched to 'done'.
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

  // Guard: a main_task with no sprint_tasks at all should not be auto-completed.
  if (!sprintTasks || sprintTasks.length === 0) return

  const allDone = sprintTasks.every((t) => t.status === 'done')

  if (allDone) {
    const { error: updateError } = await supabase
      .from('main_tasks')
      .update({ status: 'done' })
      .eq('id', mainTaskId)

    if (updateError) throw new Error(`completeMainTaskIfAllDone (update): ${updateError.message}`)
  }
}

// ─── Rule D ───────────────────────────────────────────────────────────────────

/**
 * Rule D — main_task → blocked or stopped
 *
 * Option A (approved): sprint_task statuses are NOT changed.
 * The main_task status is the source of truth for the blocked/stopped state.
 * The UI reads the parent main_task status to infer that its sprint_tasks
 * are effectively blocked — no DB writes to sprint_tasks are made here.
 *
 * The active sprint id is resolved for future use (e.g. UI filtering)
 * but no mutations are performed.
 *
 * @param mainTaskId - The main task being blocked or stopped
 * @param newStatus  - 'blocked' | 'stopped'
 */
export async function cascadeMainTaskBlock(
  mainTaskId: string,
  newStatus: Extract<MainTaskStatus, 'blocked' | 'stopped'>,
  supabase: TypedSupabaseClient
): Promise<void> {
  // Option A: no sprint_task status mutations.
  // The main_task.status field is the authoritative signal.
  // Suppress unused-parameter warnings — kept for call-site symmetry and future use.
  void mainTaskId
  void newStatus
  void supabase
}

// ─── Rule E ───────────────────────────────────────────────────────────────────

/**
 * Rule E — main_task → in_progress (from blocked/stopped)
 *
 * Option A (approved): sprint_task statuses are NOT changed.
 * Because Rule D did not mutate sprint_task statuses, there is nothing
 * to revert here. The main_task status returning to 'in_progress' is
 * itself the signal that sprint_tasks are unblocked.
 *
 * @param mainTaskId  - The main task being unblocked
 * @param prevStatus  - The status it held before this transition
 */
export async function cascadeMainTaskUnblock(
  mainTaskId: string,
  prevStatus: Extract<MainTaskStatus, 'blocked' | 'stopped'>,
  supabase: TypedSupabaseClient
): Promise<void> {
  // Option A: no sprint_task status mutations.
  void mainTaskId
  void prevStatus
  void supabase
}

// ─── Orchestrators ────────────────────────────────────────────────────────────

/**
 * Called from POST /api/sprint-tasks after a new sprint_task is inserted.
 *
 * Applies: Rule B
 */
export async function onSprintTaskCreated(
  sprintTaskId: string,
  mainTaskId: string,
  supabase: TypedSupabaseClient
): Promise<void> {
  void sprintTaskId // reserved for future rule extensions
  await promoteMainTaskIfBacklog(mainTaskId, supabase) // Rule B
}

/**
 * Called from PATCH /api/sprint-tasks/[id] after a sprint_task is updated.
 *
 * Applies (in order):
 *   Rule A — if newStatus === 'in_progress'
 *   Rule B — always (any field modification counts)
 *   Rule C — if newStatus === 'done'
 *
 * @param sprintTaskId - The task that was patched
 * @param newStatus    - The status value sent in the patch body (undefined if status was not changed)
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

  await promoteMainTaskIfBacklog(mainTaskId, supabase) // Rule B

  if (newStatus === 'done') {
    await completeMainTaskIfAllDone(mainTaskId, supabase) // Rule C
  }
}

/**
 * Called from PATCH /api/main-tasks/[id] after a main_task status changes.
 *
 * Applies (in order):
 *   Rule D — if newStatus is 'blocked' or 'stopped'
 *   Rule E — if newStatus is 'in_progress' and prevStatus was 'blocked' or 'stopped'
 *
 * @param mainTaskId  - The main task that was patched
 * @param newStatus   - The status value after the patch
 * @param prevStatus  - The status value before the patch
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
