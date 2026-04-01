// ─── Enums ────────────────────────────────────────────────────────────────────

export type MainTaskStatus = 'backlog' | 'in_progress' | 'blocked' | 'stopped' | 'done'
export type SprintTaskStatus = 'not_started' | 'in_progress' | 'done' | 'partly_completed'
export type WorkloadStatus = 'not_started' | 'in_progress' | 'done' | 'halted'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'
export type SprintStatus = 'active' | 'archived'
export type LoadCategory = 'underloaded' | 'underperforming' | 'balanced' | 'overloaded'

// ─── Row types ────────────────────────────────────────────────────────────────

export interface Sprint {
  id: string
  sprint_number: number
  name: string
  status: SprintStatus
  start_date: string        // ISO date string (YYYY-MM-DD)
  end_date: string          // ISO date string (YYYY-MM-DD)
  created_at: string
}

export interface MainTask {
  id: string
  name: string
  status: MainTaskStatus
  progress: number          // 0–100, calculated — never set directly
  time_spent: number        // minutes, calculated — never set directly
  category: string | null
  priority: TaskPriority
  created_at: string
  updated_at: string
}

export interface SprintTask {
  id: string
  main_task_id: string
  sprint_id: string
  name: string
  status: SprintTaskStatus
  priority: TaskPriority
  rolled_over_from: string | null   // FK → sprint_tasks.id
  created_at: string
  updated_at: string
}

export interface WorkloadEntry {
  id: string
  sprint_task_id: string
  status: WorkloadStatus
  start_date: string | null   // ISO date string (YYYY-MM-DD)
  due_date: string | null     // ISO date string (YYYY-MM-DD)
  planned_time: number        // minutes
  actual_time: number         // minutes
  created_at: string
  updated_at: string
}

export interface CalendarEvent {
  id: string
  workload_entry_id: string
  external_event_id: string
  calendar_id: string
  synced_at: string
}

export interface WorkloadReport {
  id: string
  week_start: string          // ISO date string (YYYY-MM-DD)
  week_end: string            // ISO date string (YYYY-MM-DD)
  total_planned: number       // minutes
  total_actual: number        // minutes
  efficiency: number          // percentage
  load_level: number          // percentage
  load_category: LoadCategory
  generated_at: string
}

// ─── Insert / Update utility types ───────────────────────────────────────────

type AutoFields = 'id' | 'created_at' | 'updated_at'

export type InsertSprint = Omit<Sprint, AutoFields>
export type UpdateSprint = Partial<Omit<Sprint, AutoFields>>

export type InsertMainTask = Omit<MainTask, AutoFields | 'progress' | 'time_spent'>
export type UpdateMainTask = Partial<Omit<MainTask, AutoFields | 'progress' | 'time_spent'>>

export type InsertSprintTask = Omit<SprintTask, AutoFields>
export type UpdateSprintTask = Partial<Omit<SprintTask, AutoFields>>

export type InsertWorkloadEntry = Omit<WorkloadEntry, AutoFields>
export type UpdateWorkloadEntry = Partial<Omit<WorkloadEntry, AutoFields>>

export type InsertCalendarEvent = Omit<CalendarEvent, 'id' | 'synced_at'>
export type UpdateCalendarEvent = Partial<Omit<CalendarEvent, 'id' | 'synced_at'>>

export type InsertWorkloadReport = Omit<WorkloadReport, 'id' | 'generated_at'>

// ─── Supabase Database shape (for createClient<Database>) ────────────────────

export interface Database {
  public: {
    Tables: {
      sprints: {
        Row: Sprint
        Insert: InsertSprint
        Update: UpdateSprint
      }
      main_tasks: {
        Row: MainTask
        Insert: InsertMainTask
        Update: UpdateMainTask
      }
      sprint_tasks: {
        Row: SprintTask
        Insert: InsertSprintTask
        Update: UpdateSprintTask
      }
      workload_entries: {
        Row: WorkloadEntry
        Insert: InsertWorkloadEntry
        Update: UpdateWorkloadEntry
      }
      calendar_events: {
        Row: CalendarEvent
        Insert: InsertCalendarEvent
        Update: UpdateCalendarEvent
      }
      workload_reports: {
        Row: WorkloadReport
        Insert: InsertWorkloadReport
        Update: never
      }
    }
  }
}
