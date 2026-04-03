import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type TypedSupabaseClient = SupabaseClient<Database>

// ─── recalculateMainTaskProgress ─────────────────────────────────────────────

/**
 * Recalculates and persists main_tasks.progress for a given main task.
 *
 * Weight logic (from CLAUDE.md):
 *   1. Per sprint_task: weight = MAX(planned_time) across all its workload_entries
 *   2. If that max > 0  → use it as the weight
 *      If that max = 0  → use the average of the weights that ARE > 0
 *      If ALL maxes = 0 → use 1 for every task (unweighted)
 *   3. progress = (sum of weights for DONE tasks) / (sum of all weights) × 100
 *   4. Rounded to 2 decimal places
 *
 * Never call main_tasks.progress directly — always go through this function.
 */
export async function recalculateMainTaskProgress(
  mainTaskId: string,
  supabase: TypedSupabaseClient
): Promise<void> {
  // ── 1. Fetch all sprint_tasks ─────────────────────────────────────────────
  const { data: sprintTasks, error: stError } = await supabase
    .from('sprint_tasks')
    .select('id, status')
    .eq('main_task_id', mainTaskId)

  if (stError) throw new Error(`recalculateMainTaskProgress (sprint_tasks): ${stError.message}`)

  if (!sprintTasks || sprintTasks.length === 0) {
    const { error } = await supabase
      .from('main_tasks')
      .update({ progress: 0 })
      .eq('id', mainTaskId)
    if (error) throw new Error(`recalculateMainTaskProgress (update zero): ${error.message}`)
    return
  }

  const sprintTaskIds = sprintTasks.map((t) => t.id)

  // ── 2. Fetch all workload_entries for these sprint_tasks in one query ─────
  const { data: entries, error: weError } = await supabase
    .from('workload_entries')
    .select('sprint_task_id, planned_time')
    .in('sprint_task_id', sprintTaskIds)

  if (weError) throw new Error(`recalculateMainTaskProgress (workload_entries): ${weError.message}`)

  // Build map: sprintTaskId → MAX(planned_time). Default to 0 for tasks with no entries.
  const maxPlannedByTask = new Map<string, number>(sprintTaskIds.map((id) => [id, 0]))
  for (const entry of entries ?? []) {
    const prev = maxPlannedByTask.get(entry.sprint_task_id) ?? 0
    if (entry.planned_time > prev) {
      maxPlannedByTask.set(entry.sprint_task_id, entry.planned_time)
    }
  }

  // ── 3. Compute weights ────────────────────────────────────────────────────
  // Pass 1: average of maxes that are > 0 (used as fallback for zero-planned tasks)
  const positivePlanned = sprintTasks
    .map((t) => maxPlannedByTask.get(t.id) ?? 0)
    .filter((v) => v > 0)

  const avgOfOthers =
    positivePlanned.length > 0
      ? positivePlanned.reduce((sum, v) => sum + v, 0) / positivePlanned.length
      : 0

  // Pass 2: assign each task its weight
  const weights = sprintTasks.map((t) => {
    const maxPlanned = maxPlannedByTask.get(t.id) ?? 0
    if (maxPlanned > 0) return maxPlanned      // has its own weight
    if (avgOfOthers > 0) return avgOfOthers    // borrow average from others
    return 1                                    // all-zero fallback
  })

  // ── 4. Calculate progress ─────────────────────────────────────────────────
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  const doneWeight = sprintTasks.reduce(
    (sum, t, i) => (t.status === 'done' ? sum + weights[i] : sum),
    0
  )

  const raw = totalWeight > 0 ? (doneWeight / totalWeight) * 100 : 0
  const progress = Math.round(raw * 100) / 100 // 2 decimal places

  // ── 5. Persist ────────────────────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from('main_tasks')
    .update({ progress })
    .eq('id', mainTaskId)

  if (updateError) throw new Error(`recalculateMainTaskProgress (update): ${updateError.message}`)
}

// ─── recalculateTimeSpent ─────────────────────────────────────────────────────

/**
 * Recalculates and persists main_tasks.time_spent for a given main task.
 *
 * time_spent = SUM of actual_time across ALL workload_entries for ALL sprint_tasks
 * belonging to this main task (stored as INTEGER minutes).
 *
 * Never set main_tasks.time_spent directly — always go through this function.
 */
export async function recalculateTimeSpent(
  mainTaskId: string,
  supabase: TypedSupabaseClient
): Promise<void> {
  // ── 1. Fetch sprint_task IDs ───────────────────────────────────────────────
  const { data: sprintTasks, error: stError } = await supabase
    .from('sprint_tasks')
    .select('id')
    .eq('main_task_id', mainTaskId)

  if (stError) throw new Error(`recalculateTimeSpent (sprint_tasks): ${stError.message}`)

  if (!sprintTasks || sprintTasks.length === 0) {
    const { error } = await supabase
      .from('main_tasks')
      .update({ time_spent: 0 })
      .eq('id', mainTaskId)
    if (error) throw new Error(`recalculateTimeSpent (update zero): ${error.message}`)
    return
  }

  const sprintTaskIds = sprintTasks.map((t) => t.id)

  // ── 2. Sum all actual_time in one query ───────────────────────────────────
  const { data: entries, error: weError } = await supabase
    .from('workload_entries')
    .select('actual_time')
    .in('sprint_task_id', sprintTaskIds)

  if (weError) throw new Error(`recalculateTimeSpent (workload_entries): ${weError.message}`)

  const timeSpent = (entries ?? []).reduce((sum, e) => sum + e.actual_time, 0)

  // ── 3. Persist ────────────────────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from('main_tasks')
    .update({ time_spent: timeSpent })
    .eq('id', mainTaskId)

  if (updateError) throw new Error(`recalculateTimeSpent (update): ${updateError.message}`)
}

// ─── recalculateAll ───────────────────────────────────────────────────────────

/**
 * Runs both recalculations sequentially for a given main task.
 *
 * Sequential (not parallel) to avoid a race condition where both functions
 * attempt to write different fields to the same main_tasks row simultaneously.
 */
export async function recalculateAll(
  mainTaskId: string,
  supabase: TypedSupabaseClient
): Promise<void> {
  await recalculateMainTaskProgress(mainTaskId, supabase)
  await recalculateTimeSpent(mainTaskId, supabase)
}
