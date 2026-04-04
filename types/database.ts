export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─── Database (canonical SDK-generated shape) ─────────────────────────────────
// Generated from Supabase project nmqfxsfdpnbbemyrwjwh.
// sprint_task_status includes 'blocked' | 'stopped' per migration 002.

export type Database = {
  // Allows automatic instantiation of createClient with the right PostgREST version
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      calendar_events: {
        Row: {
          calendar_id: string
          external_event_id: string
          id: string
          synced_at: string
          workload_entry_id: string
        }
        Insert: {
          calendar_id?: string
          external_event_id: string
          id?: string
          synced_at?: string
          workload_entry_id: string
        }
        Update: {
          calendar_id?: string
          external_event_id?: string
          id?: string
          synced_at?: string
          workload_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_workload_entry_id_fkey"
            columns: ["workload_entry_id"]
            isOneToOne: true
            referencedRelation: "workload_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      main_tasks: {
        Row: {
          blocked_by: string | null
          category: string | null
          created_at: string
          deadline: string | null
          display_id: string
          id: string
          link: string | null
          mt_number: number
          name: string
          note: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          progress: number
          status: Database["public"]["Enums"]["main_task_status"]
          taken_at: string | null
          task_owner: string | null
          time_spent: number
          updated_at: string
        }
        Insert: {
          blocked_by?: string | null
          category?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          link?: string | null
          name: string
          note?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          progress?: number
          status?: Database["public"]["Enums"]["main_task_status"]
          taken_at?: string | null
          task_owner?: string | null
          time_spent?: number
          updated_at?: string
        }
        Update: {
          blocked_by?: string | null
          category?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          link?: string | null
          name?: string
          note?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          progress?: number
          status?: Database["public"]["Enums"]["main_task_status"]
          taken_at?: string | null
          task_owner?: string | null
          time_spent?: number
          updated_at?: string
        }
        Relationships: []
      }
      sprint_tasks: {
        Row: {
          blocked_by: string | null
          created_at: string
          display_id: string
          id: string
          link: string | null
          main_task_id: string
          name: string
          note: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          rolled_over_from: string | null
          sprint_id: string
          st_number: number
          status: Database["public"]["Enums"]["sprint_task_status"]
          updated_at: string
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          link?: string | null
          main_task_id: string
          name: string
          note?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          rolled_over_from?: string | null
          sprint_id: string
          status?: Database["public"]["Enums"]["sprint_task_status"]
          updated_at?: string
        }
        Update: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          link?: string | null
          main_task_id?: string
          name?: string
          note?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          rolled_over_from?: string | null
          sprint_id?: string
          status?: Database["public"]["Enums"]["sprint_task_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprint_tasks_main_task_id_fkey"
            columns: ["main_task_id"]
            isOneToOne: false
            referencedRelation: "main_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprint_tasks_rolled_over_from_fkey"
            columns: ["rolled_over_from"]
            isOneToOne: false
            referencedRelation: "sprint_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprint_tasks_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      sprints: {
        Row: {
          created_at: string
          end_date: string
          id: string
          name: string
          sprint_number: number
          start_date: string
          status: Database["public"]["Enums"]["sprint_status"]
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          name: string
          sprint_number: number
          start_date: string
          status?: Database["public"]["Enums"]["sprint_status"]
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          sprint_number?: number
          start_date?: string
          status?: Database["public"]["Enums"]["sprint_status"]
        }
        Relationships: []
      }
      workload_entries: {
        Row: {
          actual_time: number
          created_at: string
          due_date: string | null
          id: string
          planned_time: number
          sprint_task_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["workload_status"]
          updated_at: string
        }
        Insert: {
          actual_time?: number
          created_at?: string
          due_date?: string | null
          id?: string
          planned_time?: number
          sprint_task_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["workload_status"]
          updated_at?: string
        }
        Update: {
          actual_time?: number
          created_at?: string
          due_date?: string | null
          id?: string
          planned_time?: number
          sprint_task_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["workload_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workload_entries_sprint_task_id_fkey"
            columns: ["sprint_task_id"]
            isOneToOne: false
            referencedRelation: "sprint_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      workload_reports: {
        Row: {
          efficiency: number
          generated_at: string
          id: string
          load_category: Database["public"]["Enums"]["load_category"]
          load_level: number
          total_actual: number
          total_planned: number
          week_end: string
          week_start: string
        }
        Insert: {
          efficiency: number
          generated_at?: string
          id?: string
          load_category: Database["public"]["Enums"]["load_category"]
          load_level: number
          total_actual: number
          total_planned: number
          week_end: string
          week_start: string
        }
        Update: {
          efficiency?: number
          generated_at?: string
          id?: string
          load_category?: Database["public"]["Enums"]["load_category"]
          load_level?: number
          total_actual?: number
          total_planned?: number
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      load_category:
        | "underloaded"
        | "underperforming"
        | "balanced"
        | "overloaded"
      main_task_status:
        | "backlog"
        | "in_progress"
        | "blocked"
        | "stopped"
        | "done"
      sprint_status: "active" | "archived"
      // blocked + stopped added by migration 002
      sprint_task_status:
        | "not_started"
        | "in_progress"
        | "done"
        | "partly_completed"
        | "blocked"
        | "stopped"
      task_priority: "low" | "medium" | "high" | "critical"
      workload_status: "not_started" | "in_progress" | "done" | "halted"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// ─── Enum type aliases ────────────────────────────────────────────────────────

export type MainTaskStatus   = Database["public"]["Enums"]["main_task_status"]
export type SprintTaskStatus = Database["public"]["Enums"]["sprint_task_status"]
export type WorkloadStatus   = Database["public"]["Enums"]["workload_status"]
export type TaskPriority     = Database["public"]["Enums"]["task_priority"]
export type SprintStatus     = Database["public"]["Enums"]["sprint_status"]
export type LoadCategory     = Database["public"]["Enums"]["load_category"]

// ─── Row type aliases ─────────────────────────────────────────────────────────

export type Sprint          = Database["public"]["Tables"]["sprints"]["Row"]
export type MainTask        = Database["public"]["Tables"]["main_tasks"]["Row"]
export type SprintTask      = Database["public"]["Tables"]["sprint_tasks"]["Row"]
export type WorkloadEntry   = Database["public"]["Tables"]["workload_entries"]["Row"]
export type CalendarEvent   = Database["public"]["Tables"]["calendar_events"]["Row"]
export type WorkloadReport  = Database["public"]["Tables"]["workload_reports"]["Row"]

// ─── Insert / Update type aliases ─────────────────────────────────────────────

export type InsertSprint         = Database["public"]["Tables"]["sprints"]["Insert"]
export type UpdateSprint         = Database["public"]["Tables"]["sprints"]["Update"]

export type InsertMainTask       = Database["public"]["Tables"]["main_tasks"]["Insert"]
export type UpdateMainTask       = Database["public"]["Tables"]["main_tasks"]["Update"]

export type InsertSprintTask     = Database["public"]["Tables"]["sprint_tasks"]["Insert"]
export type UpdateSprintTask     = Database["public"]["Tables"]["sprint_tasks"]["Update"]

export type InsertWorkloadEntry  = Database["public"]["Tables"]["workload_entries"]["Insert"]
export type UpdateWorkloadEntry  = Database["public"]["Tables"]["workload_entries"]["Update"]

export type InsertCalendarEvent  = Database["public"]["Tables"]["calendar_events"]["Insert"]
export type UpdateCalendarEvent  = Database["public"]["Tables"]["calendar_events"]["Update"]

export type InsertWorkloadReport = Database["public"]["Tables"]["workload_reports"]["Insert"]
