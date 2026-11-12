import { useState } from 'react'
import { FolderPlus, FilePlus, X } from 'lucide-react'
import { selectFile, selectFolder, saveFolder } from '../api'
import type { Job, SaveJobPayload, Schedule } from '../types'
import { useT } from '../lib/i18n-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import { Card, CardContent } from './ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import type { TKey } from '../lib/i18n'

interface Props {
  job: Job | null
  busy?: boolean
  /** Existing group names, shown as suggestions. */
  groups?: string[]
  onSave: (payload: SaveJobPayload) => void
  onCancel: () => void
}

type Kind = Schedule['kind']

const WEEKDAY_KEYS: TKey[] = [
  'weekday.1',
  'weekday.2',
  'weekday.3',
  'weekday.4',
  'weekday.5',
  'weekday.6',
  'weekday.7',
]

function emptySchedule(): Schedule {
  return { kind: 'daily', hour: 2, minute: 0 }
}

export default function JobEditor({ job, busy = false, groups = [], onSave, onCancel }: Props) {
  const { t } = useT()
  const [name, setName] = useState(job?.name ?? '')
  const [group, setGroup] = useState(job?.group ?? '')
  const [sources, setSources] = useState<string[]>(job?.source_paths ?? [])
  const [output, setOutput] = useState(job?.output_path ?? '')
  const [includeMasks, setIncludeMasks] = useState((job?.include_masks ?? []).join(', '))
  const [excludeMasks, setExcludeMasks] = useState((job?.exclude_masks ?? []).join(', '))
  const [enabled, setEnabled] = useState(job?.enabled ?? true)
  const [useSchedule, setUseSchedule] = useState(job?.schedule != null)
  const [schedule, setSchedule] = useState<Schedule>(job?.schedule ?? emptySchedule())

  function patchSchedule(patch: Record<string, unknown>) {
    setSchedule((prev) => ({ ...prev, ...patch } as Schedule))
  }

  function changeKind(kind: Kind) {
    switch (kind) {
      case 'every_minutes':
        setSchedule({ kind, minutes: 60 })
        break
      case 'hourly':
        setSchedule({ kind, minute: 0 })
        break
      case 'daily':
        setSchedule({ kind, hour: 2, minute: 0 })
        break
      case 'weekly':
        setSchedule({ kind, weekday: 1, hour: 2, minute: 0 })
        break
      case 'cron':
        setSchedule({ kind, expression: '0 2 * * *' })
        break
    }
  }

  async function addFolder() {
    const p = await selectFolder()
    if (p) setSources((s) => [...s, p])
  }

  async function addFile() {
    const p = await selectFile()
    if (p) setSources((s) => [...s, p])
  }

  async function pickOutput() {
    const p = await saveFolder()
    if (p) setOutput(p)
  }

  function submit() {
    const payload: SaveJobPayload = {
      id: job?.id,
      name: name.trim(),
      source_paths: sources,
      output_path: output,
      include_masks: splitMasks(includeMasks),
      exclude_masks: splitMasks(excludeMasks),
      schedule: useSchedule ? schedule : null,
      enabled,
      group: group.trim() ? group.trim() : null,
    }
    onSave(payload)
  }

  const valid = name.trim().length > 0 && sources.length > 0 && output.trim().length > 0

  return (
    <div className="w-full">
      <div className="mb-5 flex items-center gap-3">
        <h2 className="text-lg font-semibold">{job ? t('editor.edit') : t('editor.new')}</h2>
        {busy && <Badge variant="secondary">{t('editor.busy')}</Badge>}
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="job-name">{t('editor.name')}</Label>
          <Input
            id="job-name"
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('editor.namePh')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="job-group">{t('editor.group')}</Label>
          <Input
            id="job-group"
            list="job-group-suggestions"
            value={group}
            disabled={busy}
            onChange={(e) => setGroup(e.target.value)}
            placeholder={t('editor.groupPh')}
          />
          <datalist id="job-group-suggestions">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <p className="text-xs text-muted-foreground">{t('editor.groupHint')}</p>
        </div>

        <div className="space-y-2">
          <Label>{t('editor.sources')}</Label>
          <div className="min-h-[42px] rounded-md border bg-card/40 p-2">
            {sources.map((s, i) => (
              <div key={`${s}-${i}`} className="flex items-center justify-between gap-2 py-0.5">
                <code className="truncate text-xs">{s}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  disabled={busy}
                  onClick={() => setSources((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {sources.length === 0 && (
              <p className="px-1 py-2 text-sm text-muted-foreground">{t('editor.sourcesEmpty')}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={addFolder}>
              <FolderPlus className="h-4 w-4" />
              {t('editor.folder')}
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={addFile}>
              <FilePlus className="h-4 w-4" />
              {t('editor.file')}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="job-output">{t('editor.output')}</Label>
          <div className="flex gap-2">
            <Input
              id="job-output"
              value={output}
              disabled={busy}
              onChange={(e) => setOutput(e.target.value)}
              placeholder={t('editor.outputPh')}
            />
            <Button variant="outline" disabled={busy} onClick={pickOutput}>
              {t('editor.choose')}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="job-include">{t('editor.include')}</Label>
            <Input
              id="job-include"
              value={includeMasks}
              disabled={busy}
              onChange={(e) => setIncludeMasks(e.target.value)}
              placeholder="*.txt, *.docx"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="job-exclude">{t('editor.exclude')}</Label>
            <Input
              id="job-exclude"
              value={excludeMasks}
              disabled={busy}
              onChange={(e) => setExcludeMasks(e.target.value)}
              placeholder="*.tmp, cache/*"
            />
          </div>
        </div>

        <Separator />

        <div className="flex items-center gap-2">
          <Switch
            id="job-enabled"
            checked={enabled}
            disabled={busy}
            onCheckedChange={setEnabled}
          />
          <Label htmlFor="job-enabled" className="cursor-pointer">
            {t('editor.enabled')}
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="job-schedule"
            checked={useSchedule}
            disabled={busy}
            onCheckedChange={setUseSchedule}
          />
          <Label htmlFor="job-schedule" className="cursor-pointer">
            {t('editor.useSchedule')}
          </Label>
        </div>

        {useSchedule && (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <Label>{t('editor.scheduleType')}</Label>
                <Select
                  value={schedule.kind}
                  disabled={busy}
                  onValueChange={(v) => changeKind(v as Kind)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="every_minutes">{t('editor.kind.every_minutes')}</SelectItem>
                    <SelectItem value="hourly">{t('editor.kind.hourly')}</SelectItem>
                    <SelectItem value="daily">{t('editor.kind.daily')}</SelectItem>
                    <SelectItem value="weekly">{t('editor.kind.weekly')}</SelectItem>
                    <SelectItem value="cron">{t('editor.kind.cron')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {schedule.kind === 'every_minutes' && (
                <div className="space-y-2">
                  <Label htmlFor="s-minutes">{t('editor.interval')}</Label>
                  <Input
                    id="s-minutes"
                    type="number"
                    min={1}
                    disabled={busy}
                    value={schedule.minutes}
                    onChange={(e) => patchSchedule({ minutes: Number(e.target.value) })}
                  />
                </div>
              )}

              {schedule.kind === 'hourly' && (
                <div className="space-y-2">
                  <Label htmlFor="s-minute">{t('editor.minuteOfHour')}</Label>
                  <Input
                    id="s-minute"
                    type="number"
                    min={0}
                    max={59}
                    disabled={busy}
                    value={schedule.minute}
                    onChange={(e) => patchSchedule({ minute: Number(e.target.value) })}
                  />
                </div>
              )}

              {schedule.kind === 'daily' && (
                <div className="flex gap-4">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="s-hour">{t('editor.hour')}</Label>
                    <Input
                      id="s-hour"
                      type="number"
                      min={0}
                      max={23}
                      disabled={busy}
                      value={schedule.hour}
                      onChange={(e) => patchSchedule({ hour: Number(e.target.value) })}
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="s-mins">{t('editor.minute')}</Label>
                    <Input
                      id="s-mins"
                      type="number"
                      min={0}
                      max={59}
                      disabled={busy}
                      value={schedule.minute}
                      onChange={(e) => patchSchedule({ minute: Number(e.target.value) })}
                    />
                  </div>
                </div>
              )}

              {schedule.kind === 'weekly' && (
                <div className="flex gap-4">
                  <div className="flex-1 space-y-2">
                    <Label>{t('editor.weekday')}</Label>
                    <Select
                      value={String(schedule.weekday)}
                      disabled={busy}
                      onValueChange={(v) => patchSchedule({ weekday: Number(v) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAY_KEYS.map((key, i) => (
                          <SelectItem key={key} value={String(i + 1)}>
                            {t(key)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="w-hour">{t('editor.hour')}</Label>
                    <Input
                      id="w-hour"
                      type="number"
                      min={0}
                      max={23}
                      disabled={busy}
                      value={schedule.hour}
                      onChange={(e) => patchSchedule({ hour: Number(e.target.value) })}
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="w-minute">{t('editor.minute')}</Label>
                    <Input
                      id="w-minute"
                      type="number"
                      min={0}
                      max={59}
                      disabled={busy}
                      value={schedule.minute}
                      onChange={(e) => patchSchedule({ minute: Number(e.target.value) })}
                    />
                  </div>
                </div>
              )}

              {schedule.kind === 'cron' && (
                <div className="space-y-2">
                  <Label htmlFor="s-cron">{t('editor.cron')}</Label>
                  <Input
                    id="s-cron"
                    value={schedule.expression}
                    disabled={busy}
                    onChange={(e) => patchSchedule({ expression: e.target.value })}
                    placeholder="0 2 * * *"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Separator className="my-6" />

      <div className="flex items-center gap-3">
        <Button disabled={!valid || busy} onClick={submit}>
          {t('editor.save')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('editor.cancel')}
        </Button>
        {!valid && (
          <span className="text-xs text-muted-foreground">{t('editor.invalid')}</span>
        )}
      </div>
    </div>
  )
}

function splitMasks(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}
