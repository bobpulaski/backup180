import { useEffect, useMemo, useRef, useState } from 'react'
import { HardDrive, Play, Plus, Trash2, Loader2, RefreshCw, Sun, Moon, Folder, ScrollText, ChevronDown, ChevronRight, Settings } from 'lucide-react'
import { listen } from '@tauri-apps/api/event'
import { applyTheme, getInitialTheme, type Theme } from './lib/theme'
import {
  clearLogs,
  deleteJob,
  getAutostart,
  loadJobs,
  loadLogs,
  reloadScheduler,
  runBackupJob,
  saveJob,
  setAutostart,
} from './api'
import type { BackupRunResult, Job, LogEntry, SaveJobPayload } from './types'
import JobEditor from './components/JobEditor'
import { Button } from './components/ui/button'
import { Switch } from './components/ui/switch'
import { Separator } from './components/ui/separator'
import { Label } from './components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog'
import { Card, CardContent } from './components/ui/card'

function pluralFiles(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'файл'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'файла'
  return 'файлов'
}

/** Translate the backend status string (e.g. "ok: 3 files" / "error: …") to Russian. */
function statusLabel(status: string): string {
  const ok = status.match(/^ok:\s*(\d+)\s*files?$/i)
  if (ok) {
    const n = Number(ok[1])
    return `Успешно: ${n} ${pluralFiles(n)}`
  }
  const err = status.match(/^error:\s*(.*)$/is)
  if (err) return `Ошибка: ${err[1]}`
  return status
}

function logKindLabel(kind: string): string {
  switch (kind) {
    case 'created':
      return 'создано'
    case 'updated':
      return 'изменено'
    case 'deleted':
      return 'удалено'
    case 'run_ok':
      return 'успех'
    case 'run_error':
      return 'ошибка'
    default:
      return kind
  }
}

function logDot(kind: string): string {
  if (kind === 'run_error') return 'bg-destructive'
  if (kind === 'run_ok') return 'bg-success'
  if (kind === 'deleted') return 'bg-muted-foreground/60'
  return 'bg-primary'
}

function logBadge(kind: string): string {
  if (kind === 'run_error') return 'bg-destructive/15 text-destructive'
  if (kind === 'run_ok') return 'bg-success/15 text-success'
  if (kind === 'deleted') return 'bg-muted text-muted-foreground'
  return 'bg-primary/15 text-primary'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  const units = ['КБ', 'МБ', 'ГБ', 'ТБ']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(1)} ${units[i]}`
}

function scheduleLabel(job: Job): string {
  const s = job.schedule
  if (!s) return 'Без расписания'
  switch (s.kind) {
    case 'every_minutes':
      return `Каждые ${s.minutes} мин.`
    case 'hourly':
      return `Ежечасно в :${String(s.minute).padStart(2, '0')}`
    case 'daily':
      return `Ежедневно в ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`
    case 'weekly': {
      const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
      return `Еженедельно (${days[s.weekday - 1] ?? '?'}) в ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`
    }
    case 'cron':
      return `Cron: ${s.expression}`
  }
}

function JobItem({
  job,
  active,
  running,
  onSelect,
}: {
  job: Job
  active: boolean
  running: boolean
  onSelect: () => void
}) {
  return (
    <button
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs transition-colors ${
        active
          ? 'bg-accent text-accent-foreground ring-1 ring-primary/60'
          : 'hover:bg-accent/60'
      }`}
      onClick={onSelect}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          job.enabled ? 'bg-success' : 'bg-muted-foreground/40 ring-1 ring-inset ring-muted-foreground/50'
        }`}
      />
      <span className="min-w-0 flex-1 truncate font-medium">{job.name || '(без имени)'}</span>
      {!job.enabled ? (
        <span className="shrink-0 truncate text-[10px] text-muted-foreground">отключена</span>
      ) : (
        <span className="shrink-0 truncate text-[10px] text-muted-foreground">
          {scheduleLabel(job)}
        </span>
      )}
      {running && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />}
    </button>
  )
}

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [autostart, setAutostartState] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<BackupRunResult | null>(null)
  const [creating, setCreating] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])

  // Delete-confirmation dialog state.
  const [confirmTarget, setConfirmTarget] = useState<Job | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Clear-journal confirmation dialog state.
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  const [theme, setTheme] = useState<Theme>(() => getInitialTheme())

  // Sidebar: collapsible + resizable, persisted.
  const SIDEBAR_DEFAULT = 256
  const SIDEBAR_MIN = 180
  const SIDEBAR_MAX = 480
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const v = Number(localStorage.getItem('backup180-sidebar-width'))
    return v >= SIDEBAR_MIN && v <= SIDEBAR_MAX ? v : SIDEBAR_DEFAULT
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    () => localStorage.getItem('backup180-sidebar-collapsed') === '1',
  )
  // "Задачи" group expanded/collapsed.
  const [jobsOpen, setJobsOpen] = useState<boolean>(
    () => localStorage.getItem('backup180-jobs-open') !== '0',
  )
  // Which job group folders are expanded (persisted as a JSON array of names).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('backup180-open-groups') || '{}')
    } catch {
      return {}
    }
  })
  const dragging = useRef(false)

  useEffect(() => {
    localStorage.setItem('backup180-sidebar-width', String(sidebarWidth))
  }, [sidebarWidth])
  useEffect(() => {
    localStorage.setItem('backup180-sidebar-collapsed', sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])
  useEffect(() => {
    localStorage.setItem('backup180-jobs-open', jobsOpen ? '1' : '0')
  }, [jobsOpen])
  useEffect(() => {
    localStorage.setItem('backup180-open-groups', JSON.stringify(openGroups))
  }, [openGroups])

  function toggleGroup(name: string) {
    setOpenGroups((prev) => ({ ...prev, [name]: !(prev[name] ?? true) }))
  }

  // Global listeners for the resize drag.
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX))
      setSidebarWidth(w)
    }
    function onUp() {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  function startResize() {
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  const selected = useMemo(
    () => jobs.find((j) => j.id === selectedId) ?? null,
    [jobs, selectedId],
  )

  // Distinct group names (for the editor's suggestions).
  const groupNames = useMemo(
    () => Array.from(new Set(jobs.map((j) => j.group).filter((g): g is string => !!g))).sort(),
    [jobs],
  )

  // Jobs split into ungrouped (top level) and grouped sections, preserving order.
  const { ungrouped, grouped } = useMemo(() => {
    const ungrouped: Job[] = []
    const grouped = new Map<string, Job[]>()
    for (const job of jobs) {
      if (job.group) {
        const list = grouped.get(job.group) ?? []
        list.push(job)
        grouped.set(job.group, list)
      } else {
        ungrouped.push(job)
      }
    }
    return { ungrouped, grouped }
  }, [jobs])

  async function refresh() {
    try {
      const list = await loadJobs()
      setJobs(list)
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }

  async function refreshLogs() {
    try {
      setLogs(await loadLogs())
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleClearLogs() {
    setClearing(true)
    try {
      await clearLogs()
      await refreshLogs()
      setConfirmClear(false)
    } catch (e) {
      setError(String(e))
    } finally {
      setClearing(false)
    }
  }

  async function refreshAutostart() {
    try {
      setAutostartState(await getAutostart())
    } catch (e) {
      setError(String(e))
    }
  }

  useEffect(() => {
    refresh()
    refreshAutostart()
    refreshLogs()
  }, [])

  // Keep the latest handlers in refs so tray listeners never go stale.
  const runAllRef = useRef<() => void>(() => {})
  const toggleAutostartRef = useRef<() => void>(() => {})

  // Wire system-tray menu events to the UI.
  useEffect(() => {
    const unlistenRun = listen('tray-run-backup', () => runAllRef.current())
    const unlistenAuto = listen('tray-toggle-autostart', () => toggleAutostartRef.current())
    return () => {
      unlistenRun.then((f) => f())
      unlistenAuto.then((f) => f())
    }
  }, [])

  async function handleSave(payload: SaveJobPayload) {
    try {
      const saved = await saveJob(payload)
      await refresh()
      await refreshLogs()
      await reloadScheduler()
      setSelectedId(saved.id)
      setCreating(false)
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }

  function requestDelete(job: Job) {
    // Never allow deleting a job while it is running.
    if (running === job.id) return
    setConfirmTarget(job)
  }

  async function confirmDelete() {
    if (!confirmTarget) return
    setDeleting(true)
    try {
      await deleteJob(confirmTarget.id)
      await refresh()
      await refreshLogs()
      await reloadScheduler()
      if (selectedId === confirmTarget.id) setSelectedId(null)
      setConfirmTarget(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setDeleting(false)
    }
  }

  async function handleRun(id: string) {
    setRunning(id)
    setLastResult(null)
    try {
      const res = await runBackupJob(id)
      setLastResult(res)
      await refresh()
      await refreshLogs()
    } catch (e) {
      setError(String(e))
    } finally {
      setRunning(null)
    }
  }

  // Run every enabled job sequentially (used by the tray "Запустить бэкап" item).
  async function runAllEnabled() {
    const targets = jobs.filter((j) => j.enabled)
    if (targets.length === 0) {
      setError('Нет включённых задач для запуска.')
      return
    }
    setLastResult(null)
    try {
      for (const job of targets) {
        setRunning(job.id)
        const res = await runBackupJob(job.id)
        setLastResult(res)
      }
      await refresh()
      await refreshLogs()
    } catch (e) {
      setError(String(e))
    } finally {
      setRunning(null)
    }
  }

  // Keep refs current for the tray listeners.
  runAllRef.current = runAllEnabled
  toggleAutostartRef.current = toggleAutostart

  async function toggleAutostart() {
    try {
      const next = !autostart
      await setAutostart(next)
      setAutostartState(next)
    } catch (e) {
      setError(String(e))
    }
  }

  const selectedRunning = selected != null && running === selected.id

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">Backup180</h1>
            <p className="text-xs text-muted-foreground">Резервное копирование файлов и папок</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            onClick={() => {
              setCreating(true)
              setSelectedId(null)
              setShowLog(false)
              setShowSettings(false)
            }}
          >
            <Plus className="h-4 w-4" />
            Новая задача
          </Button>
        </div>
      </header>

      {/* Banners */}
      {error && (
        <button
          className="flex items-center gap-2 border-b border-destructive/40 bg-destructive/15 px-5 py-2 text-left text-xs text-destructive"
          onClick={() => setError(null)}
        >
          <RefreshCw className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <span className="opacity-70">нажмите, чтобы скрыть</span>
        </button>
      )}
      {lastResult && (
        <button
          className="flex items-center gap-2 border-b border-success/40 bg-success/15 px-5 py-2 text-left text-xs text-success"
          onClick={() => setLastResult(null)}
        >
          <span className="flex-1">
            «{lastResult.job_name}»: скопировано {lastResult.files_copied} файлов (
            {formatBytes(lastResult.bytes_copied)})
            {lastResult.errors.length > 0 && `, ошибок: ${lastResult.errors.length}`}
          </span>
          <span className="opacity-70">скрыть</span>
        </button>
      )}

      <main className="flex min-h-0 min-w-0 flex-1">
        {/* Sidebar — icon rail when collapsed */}
        {sidebarCollapsed ? (
          <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-r bg-card/50 py-3">
            <button
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              title="Задачи"
              onClick={() => {
                setSidebarCollapsed(false)
                setJobsOpen(true)
              }}
            >
              <Folder className="h-5 w-5" />
            </button>
            <button
              className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-accent hover:text-accent-foreground ${
                showLog ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
              }`}
              title="Журнал"
              onClick={() => {
                setShowLog(true)
                setCreating(false)
                setSelectedId(null)
                setShowSettings(false)
                refreshLogs()
              }}
            >
              <ScrollText className="h-5 w-5" />
              {logs.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">
                  {logs.length > 99 ? '99+' : logs.length}
                </span>
              )}
            </button>
            <button
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-accent hover:text-accent-foreground ${
                showSettings ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
              }`}
              title="Настройки"
              onClick={() => {
                setShowSettings(true)
                setShowLog(false)
                setCreating(false)
                setSelectedId(null)
              }}
            >
              <Settings className="h-5 w-5" />
            </button>
          </aside>
        ) : (
          <>
            <aside
              style={{ width: sidebarWidth }}
              className="flex shrink-0 flex-col overflow-y-auto border-r bg-card/50 p-2"
            >
              {/* "Задачи" group header: chevron toggles, + adds on hover */}
              <div className="group relative mb-1">
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent/60"
                  onClick={() => setJobsOpen((v) => !v)}
                  title={jobsOpen ? 'Свернуть задачи' : 'Развернуть задачи'}
                >
                  {jobsOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate font-medium">Задачи</span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
                  title="Новая задача"
                  onClick={() => {
                    setCreating(true)
                    setSelectedId(null)
                    setShowLog(false)
                    setShowSettings(false)
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              {jobsOpen && (
                <>
                  {jobs.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Пока нет задач
                    </p>
                  )}
                  <div className="space-y-1">
                    {ungrouped.map((job) => (
                      <JobItem
                        key={job.id}
                        job={job}
                        active={job.id === selectedId && !showLog}
                        running={running === job.id}
                        onSelect={() => {
                          setSelectedId(job.id)
                          setCreating(false)
                          setShowLog(false)
                          setShowSettings(false)
                        }}
                      />
                    ))}

                    {Array.from(grouped.entries()).map(([groupName, groupJobs]) => {
                      const open = openGroups[groupName] ?? true
                      const groupRunning = groupJobs.some((j) => running === j.id)
                      const groupActive =
                        !showLog && groupJobs.some((j) => j.id === selectedId)
                      return (
                        <div key={groupName} className="ml-3 rounded-lg">
                          <div
                            className={`group/gh flex items-center gap-1 rounded-lg px-3 py-2 text-sm ${
                              groupActive ? 'text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            <button
                              className="flex min-w-0 flex-1 items-center gap-2 transition-colors hover:text-foreground"
                              onClick={() => toggleGroup(groupName)}
                              title={open ? 'Свернуть папку' : 'Развернуть папку'}
                            >
                              {open ? (
                                <ChevronDown className="h-4 w-4 shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0" />
                              )}
                              <Folder className="h-4 w-4 shrink-0" />
                              <span className="truncate font-medium">{groupName}</span>
                            </button>
                            {groupRunning && (
                              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                            )}
                            <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
                              {groupJobs.length}
                            </span>
                          </div>
                          {open && (
                            <div className="ml-3 space-y-1 border-l pl-1.5">
                              {groupJobs.map((job) => (
                                <JobItem
                                  key={job.id}
                                  job={job}
                                  active={job.id === selectedId && !showLog}
                                  running={running === job.id}
                                  onSelect={() => {
                                    setSelectedId(job.id)
                                    setCreating(false)
                                    setShowLog(false)
                                    setShowSettings(false)
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {/* Journal entry */}
              <div className="mt-4 border-t pt-2">
                <button
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    showLog
                      ? 'bg-accent text-accent-foreground ring-1 ring-primary/60'
                      : 'hover:bg-accent/60'
                  }`}
                  onClick={() => {
                    setShowLog(true)
                    setCreating(false)
                    setSelectedId(null)
                    setShowSettings(false)
                    refreshLogs()
                  }}
                >
                  <span className="flex-1 font-medium">Журнал</span>
                  {logs.length > 0 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {logs.length}
                    </span>
                  )}
                </button>
                <button
                  className={`mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    showSettings
                      ? 'bg-accent text-accent-foreground ring-1 ring-primary/60'
                      : 'hover:bg-accent/60'
                  }`}
                  onClick={() => {
                    setShowSettings(true)
                    setShowLog(false)
                    setCreating(false)
                    setSelectedId(null)
                  }}
                >
                  <span className="flex-1 font-medium">Настройки</span>
                </button>
              </div>
            </aside>
            {/* Resize handle */}
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={startResize}
              className="group relative w-1 shrink-0 cursor-col-resize bg-border/40 transition-colors hover:bg-primary/50"
            >
              <span className="absolute inset-y-0 -left-1 -right-1" />
            </div>
          </>
        )}

        {/* Content */}
        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
          {showSettings ? (
            <div className="w-full">
              <div className="mb-4 flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Настройки</h2>
              </div>
              <div className="max-w-2xl space-y-4">
                <Card>
                  <CardContent className="flex items-center justify-between gap-4 pt-6">
                    <div className="min-w-0">
                      <Label htmlFor="settings-autostart" className="text-sm font-medium">
                        Автозапуск
                      </Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Запускать Backup180 автоматически при входе в систему.
                      </p>
                    </div>
                    <Switch
                      id="settings-autostart"
                      checked={autostart}
                      onCheckedChange={toggleAutostart}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : showLog ? (
            <div className="w-full">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <ScrollText className="h-5 w-5 text-primary" />
                  Журнал
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logs.length === 0}
                  onClick={() => setConfirmClear(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Очистить
                </Button>
              </div>
              {logs.length === 0 ? (
                <div className="flex flex-1 items-center justify-center py-20 text-sm text-muted-foreground">
                  Журнал пуст.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {logs.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-start gap-3 rounded-lg border bg-card/50 px-3 py-2"
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${logDot(entry.kind)}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">{entry.message}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(entry.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs ${logBadge(entry.kind)}`}>
                        {logKindLabel(entry.kind)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : creating || selected ? (
            <JobEditor
              key={selected?.id ?? 'new'}
              job={selected}
              busy={selectedRunning}
              groups={groupNames}
              onSave={handleSave}
              onCancel={() => {
                setCreating(false)
                setSelectedId(null)
              }}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Выберите задачу слева или создайте новую.
            </div>
          )}

          {!showLog && !showSettings && selected && (
            <>
              <Separator className="my-6" />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  disabled={selectedRunning}
                  onClick={() => handleRun(selected.id)}
                >
                  {selectedRunning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Выполняется…
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Запустить сейчас
                    </>
                  )}
                </Button>

                {selectedRunning ? (
                  <Button variant="destructive" disabled title="Нельзя удалить выполняющуюся задачу">
                    <Trash2 className="h-4 w-4" />
                    Удалить задачу
                  </Button>
                ) : (
                  <Button variant="destructive" onClick={() => requestDelete(selected)}>
                    <Trash2 className="h-4 w-4" />
                    Удалить задачу
                  </Button>
                )}

                <span className="text-xs text-muted-foreground">
                  Последний запуск:{' '}
                  {selected.last_run ? new Date(selected.last_run).toLocaleString() : '—'}
                  {selected.last_status ? ` · ${statusLabel(selected.last_status)}` : ''}
                </span>
              </div>
            </>
          )}
        </section>
      </main>

      {/* Delete confirmation */}
      <Dialog open={confirmTarget != null} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить задачу?</DialogTitle>
            <DialogDescription>
              Задача «{confirmTarget?.name || '(без имени)'}» будет удалена. Это действие нельзя
              отменить.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)} disabled={deleting}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear journal confirmation */}
      <Dialog open={confirmClear} onOpenChange={(open) => !open && setConfirmClear(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Очистить журнал?</DialogTitle>
            <DialogDescription>
              Все записи журнала будут удалены. Это действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)} disabled={clearing}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={handleClearLogs} disabled={clearing}>
              {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Очистить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
