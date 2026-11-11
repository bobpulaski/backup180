// Shared TypeScript types mirroring the Rust DTOs.

export type Schedule =
  | { kind: 'every_minutes'; minutes: number }
  | { kind: 'hourly'; minute: number }
  | { kind: 'daily'; hour: number; minute: number }
  | { kind: 'weekly'; weekday: number; hour: number; minute: number }
  | { kind: 'cron'; expression: string }

export interface Job {
  id: string
  name: string
  source_paths: string[]
  output_path: string
  include_masks: string[]
  exclude_masks: string[]
  schedule: Schedule | null
  enabled: boolean
  last_run: string | null
  last_status: string | null
  group: string | null
}

export interface SaveJobPayload {
  id?: string
  name: string
  source_paths: string[]
  output_path: string
  include_masks: string[]
  exclude_masks: string[]
  schedule: Schedule | null
  enabled: boolean
  group: string | null
}

export interface BackupRunResult {
  job_id: string
  job_name: string
  started_at: string
  finished_at: string
  files_copied: number
  bytes_copied: number
  errors: string[]
}

export interface LogEntry {
  id: string
  timestamp: string
  kind: string
  message: string
}
