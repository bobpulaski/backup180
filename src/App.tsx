import { useEffect, useMemo, useRef, useState } from 'react'
import { HardDrive, Play, Plus, Trash2, Loader2, RefreshCw, Sun, Moon, Folder, ScrollText, ChevronDown, ChevronRight, Settings, X } from 'lucide-react'
import { listen } from '@tauri-apps/api/event'
import { applyTheme, getInitialTheme, type Theme } from './lib/theme'
import { formatBytes, pluralFiles, translate, type Lang, type TKey } from './lib/i18n'
import { LangProvider } from './lib/i18n-react'
import {
  clearLogs,
  deleteJob,
  getAutostart,
  loadJobs,
  loadLogs,
  reloadScheduler,
  runBackupJob,
  cancelBackupJob,
  saveJob,
  setAutostart,
  loadSettings,
  setLanguage,
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

/** Translate the backend status string (e.g. "ok: 3 files" / "error: …"). */
function statusLabel(
  t: (k: TKey, p?: Record<string, string | number>) => string,
  status: string,
  lang: Lang,
): string {
  const ok = status.match(/^ok:\s*(\d+)\s*files?$/i)
  if (ok) {
    const n = Number(ok[1])
    return t('status.ok', { n, word: pluralFiles(n, lang) })
  }
  const err = status.match(/^error:\s*(.*)$/is)
  if (err) return t('status.error', { msg: err[1] })
  return status
}

function logDot(kind: string): string {
  if (kind === 'run_error') return 'bg-destructive'
  if (kind === 'run_ok') return 'bg-success'
  if (kind === 'run_cancelled') return 'bg-amber-500'
  if (kind === 'deleted') return 'bg-muted-foreground/60'
  return 'bg-primary'
}

function logBadge(kind: string): string {
  if (kind === 'run_error') return 'bg-destructive/15 text-destructive'
  if (kind === 'run_ok') return 'bg-success/15 text-success'
  if (kind === 'run_cancelled') return 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
  if (kind === 'deleted') return 'bg-muted text-muted-foreground'
  return 'bg-primary/15 text-primary'
}

function scheduleLabel(t: (k: TKey, p?: Record<string, string | number>) => string, job: Job): string {
  const s = job.schedule
  if (!s) return t('sched.none')
  switch (s.kind) {
    case 'every_minutes':
      return t('sched.everyMinutes', { n: s.minutes })
    case 'hourly':
      return t('sched.hourly', { mm: String(s.minute).padStart(2, '0') })
    case 'daily':
      return t('sched.daily', {
        hh: String(s.hour).padStart(2, '0'),
        mm: String(s.minute).padStart(2, '0'),
      })
    case 'weekly':
      return t('sched.weekly', {
        day: t(`weekday.${s.weekday}` as TKey),
        hh: String(s.hour).padStart(2, '0'),
        mm: String(s.minute).padStart(2, '0'),
      })
    case 'cron':
      return t('sched.cron', { expr: s.expression })
  }
}

function JobItem({
  job,
  active,
  running,
  t,
  onSelect,
}: {
  job: Job
  active: boolean
  running: boolean
  t: (k: TKey, p?: Record<string, string | number>) => string
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
      <span className="min-w-0 flex-1 truncate font-medium">{job.name || t('job.unnamed')}</span>
      {!job.enabled ? (
        <span className="shrink-0 truncate text-[10px] text-muted-foreground">
          {t('job.disabled')}
        </span>
      ) : (
        <span className="shrink-0 truncate text-[10px] text-muted-foreground">
          {scheduleLabel(t, job)}
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
  const [saved, setSaved] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [creating, setCreating] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [lang, setLangState] = useState<Lang>('ru')

  const t = useMemo(
    () => (key: TKey, params?: Record<string, string | number>) => translate(lang, key, params),
    [lang],
  )

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

  async function changeLanguage(next: Lang) {
    try {
      await setLanguage(next)
      setLangState(next)
    } catch (e) {
      setError(String(e))
    }
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

  async function refreshSettings() {
    try {
      const s = await loadSettings()
      setLangState(s.language === 'en' ? 'en' : 'ru')
    } catch (e) {
      setError(String(e))
    }
  }

  useEffect(() => {
    refresh()
    refreshAutostart()
    refreshLogs()
    refreshSettings()
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
      const result = await saveJob(payload)
      await refresh()
      await refreshLogs()
      await reloadScheduler()
      setSelectedId(result.id)
      setCreating(false)
      setError(null)
      // Show a transient "saved" confirmation.
      setSaved(true)
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setSaved(false), 3000)
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

  // Request cancellation of the currently running job.
  async function handleCancel(id: string) {
    try {
      await cancelBackupJob(id)
    } catch (e) {
      setError(String(e))
    }
  }

  // Run every enabled job sequentially (used by the tray "Run backup" item).
  async function runAllEnabled() {
    const targets = jobs.filter((j) => j.enabled)
    if (targets.length === 0) {
      setError(t('editor.errorNoEnabled'))
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
    <LangProvider lang={lang}>
    <div className="flex h-screen w-full flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">Backup180</h1>
            <p className="text-xs text-muted-foreground">{t('app.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            title={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
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
            {t('job.new')}
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
          <span className="opacity-70">{t('banner.hideHint')}</span>
        </button>
      )}
      {saved && (
        <button
          className="flex items-center gap-2 border-b border-success/40 bg-success/15 px-5 py-2 text-left text-xs text-success"
          onClick={() => setSaved(false)}
        >
          <span className="flex-1">{t('banner.saved')}</span>
          <span className="opacity-70">{t('banner.hide')}</span>
        </button>
      )}
      {lastResult && (
        <button
          className={`flex items-center gap-2 border-b px-5 py-2 text-left text-xs ${
            lastResult.cancelled
              ? 'border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400'
              : 'border-success/40 bg-success/15 text-success'
          }`}
          onClick={() => setLastResult(null)}
        >
          <span className="flex-1">
            {lastResult.cancelled
              ? t('banner.cancelled', { name: lastResult.job_name })
              : t('banner.result', {
                  name: lastResult.job_name,
                  files: `${lastResult.files_copied} ${pluralFiles(lastResult.files_copied, lang)}`,
                  bytes: formatBytes(lastResult.bytes_copied, lang),
                })}
            {!lastResult.cancelled &&
              lastResult.errors.length > 0 &&
              t('banner.resultErrors', { n: lastResult.errors.length })}
          </span>
          <span className="opacity-70">{t('banner.hide')}</span>
        </button>
      )}

      <main className="flex min-h-0 min-w-0 flex-1">
        {/* Sidebar — icon rail when collapsed */}
        {sidebarCollapsed ? (
          <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-r bg-card/50 py-3">
            <button
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              title={t('nav.tasks')}
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
              title={t('nav.journal')}
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
              title={t('nav.settings')}
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
              {/* "Tasks" group header: chevron toggles, + adds on hover */}
              <div className="group relative mb-1">
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent/60"
                  onClick={() => setJobsOpen((v) => !v)}
                  title={jobsOpen ? t('tasks.collapse') : t('tasks.expand')}
                >
                  {jobsOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate font-medium">{t('nav.tasks')}</span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
                  title={t('job.new')}
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
                      {t('tasks.empty')}
                    </p>
                  )}
                  <div className="space-y-1">
                    {ungrouped.map((job) => (
                      <JobItem
                        key={job.id}
                        job={job}
                        active={job.id === selectedId && !showLog}
                        running={running === job.id}
                        t={t}
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
                              title={open ? t('folder.collapse') : t('folder.expand')}
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
                                  t={t}
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

              {/* Journal / Settings entries */}
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
                  <span className="flex-1 font-medium">{t('nav.journal')}</span>
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
                  <span className="flex-1 font-medium">{t('nav.settings')}</span>
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
                <h2 className="text-lg font-semibold">{t('settings.title')}</h2>
              </div>
              <div className="max-w-2xl space-y-4">
                <Card>
                  <CardContent className="flex items-center justify-between gap-4 pt-6">
                    <div className="min-w-0">
                      <Label htmlFor="settings-autostart" className="text-sm font-medium">
                        {t('settings.autostart')}
                      </Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t('settings.autostartHint')}
                      </p>
                    </div>
                    <Switch
                      id="settings-autostart"
                      checked={autostart}
                      onCheckedChange={toggleAutostart}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="flex items-center justify-between gap-4 pt-6">
                    <div className="min-w-0">
                      <Label className="text-sm font-medium">{t('settings.language')}</Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t('settings.languageHint')}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant={lang === 'ru' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => changeLanguage('ru')}
                      >
                        Русский
                      </Button>
                      <Button
                        variant={lang === 'en' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => changeLanguage('en')}
                      >
                        English
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : showLog ? (
            <div className="w-full">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <ScrollText className="h-5 w-5 text-primary" />
                  {t('journal.title')}
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logs.length === 0}
                  onClick={() => setConfirmClear(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  {t('journal.clear')}
                </Button>
              </div>
              {logs.length === 0 ? (
                <div className="flex flex-1 items-center justify-center py-20 text-sm text-muted-foreground">
                  {t('journal.empty')}
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
                        {t(`kind.${entry.kind}` as TKey)}
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
              {t('content.placeholder')}
            </div>
          )}

          {!showLog && !showSettings && selected && (
            <>
              <Separator className="my-6" />
              <div className="flex flex-wrap items-center gap-3">
                {selectedRunning ? (
                  <Button variant="destructive" onClick={() => handleCancel(selected.id)}>
                    <X className="h-4 w-4" />
                    {t('run.cancel')}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => handleRun(selected.id)}>
                    <Play className="h-4 w-4" />
                    {t('run.now')}
                  </Button>
                )}

                {selectedRunning ? (
                  <Button variant="destructive" disabled title={t('run.cannotDelete')}>
                    <Trash2 className="h-4 w-4" />
                    {t('run.deleteJob')}
                  </Button>
                ) : (
                  <Button variant="destructive" onClick={() => requestDelete(selected)}>
                    <Trash2 className="h-4 w-4" />
                    {t('run.deleteJob')}
                  </Button>
                )}

                <span className="text-xs text-muted-foreground">
                  {t('run.last')}{' '}
                  {selected.last_run ? new Date(selected.last_run).toLocaleString() : '—'}
                  {selected.last_status ? ` · ${statusLabel(t, selected.last_status, lang)}` : ''}
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
            <DialogTitle>{t('delete.title')}</DialogTitle>
            <DialogDescription>
              {t('delete.desc', { name: confirmTarget?.name || t('job.unnamed') })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)} disabled={deleting}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear journal confirmation */}
      <Dialog open={confirmClear} onOpenChange={(open) => !open && setConfirmClear(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('clear.title')}</DialogTitle>
            <DialogDescription>{t('clear.desc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)} disabled={clearing}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleClearLogs} disabled={clearing}>
              {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t('journal.clear')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </LangProvider>
  )
}
