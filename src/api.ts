// Thin wrappers over Tauri `invoke` for the backend commands.
import { invoke } from '@tauri-apps/api/core'
import type { AppSettings, BackupRunResult, Job, LogEntry, SaveJobPayload } from './types'

export const loadJobs = () => invoke<Job[]>('load_jobs')

export const getJob = (id: string) => invoke<Job | null>('get_job', { id })

export const loadLogs = () => invoke<LogEntry[]>('load_logs')

export const clearLogs = () => invoke<void>('clear_logs')

export const saveJob = (payload: SaveJobPayload) =>
  invoke<Job>('save_job', { payload })

export const deleteJob = (id: string) => invoke<void>('delete_job', { id })

export const runBackupJob = (id: string) => invoke<BackupRunResult>('run_backup_job', { id })

export const selectFolder = () => invoke<string | null>('select_folder')

export const selectFile = () => invoke<string | null>('select_file')

export const saveFolder = () => invoke<string | null>('save_folder')

export const getAutostart = () => invoke<boolean>('get_autostart')

export const setAutostart = (enabled: boolean) => invoke<void>('set_autostart', { enabled })

export const openMainWindow = () => invoke<void>('open_main_window')

export const reloadScheduler = () => invoke<void>('reload_scheduler')

export const loadSettings = () => invoke<AppSettings>('load_settings')

export const setLanguage = (language: string) => invoke<void>('set_language', { language })
