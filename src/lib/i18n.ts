// Frontend localization (ru/en). Backend-generated strings (tray, journal
// messages) are localized in Rust; this covers the window UI.

export type Lang = 'ru' | 'en'

const ru = {
  // topbar
  'app.subtitle': 'Резервное копирование файлов и папок',
  'theme.toLight': 'Светлая тема',
  'theme.toDark': 'Тёмная тема',
  'job.new': 'Новая задача',
  // banners
  'banner.hideHint': 'нажмите, чтобы скрыть',
  'banner.hide': 'скрыть',
  'banner.result': '«{name}»: скопировано {files} ({bytes})',
  'banner.resultErrors': ', ошибок: {n}',
  'banner.saved': 'Изменения сохранены',
  'banner.cancelled': 'Задача «{name}» отменена',
  // sidebar
  'nav.tasks': 'Задачи',
  'nav.journal': 'Журнал',
  'nav.settings': 'Настройки',
  'tasks.expand': 'Развернуть задачи',
  'tasks.collapse': 'Свернуть задачи',
  'folder.expand': 'Развернуть папку',
  'folder.collapse': 'Свернуть папку',
  'tasks.empty': 'Пока нет задач',
  'job.unnamed': '(без имени)',
  'job.disabled': 'отключена',
  // settings
  'settings.title': 'Настройки',
  'settings.autostart': 'Автозапуск',
  'settings.autostartHint': 'Запускать Backup180 автоматически при входе в систему.',
  'settings.language': 'Язык интерфейса',
  'settings.languageHint': 'Язык кнопок, меню и журнала.',
  // journal view
  'journal.title': 'Журнал',
  'journal.clear': 'Очистить',
  'journal.empty': 'Журнал пуст.',
  // content placeholder
  'content.placeholder': 'Выберите задачу слева или создайте новую.',
  // run bar
  'run.running': 'Выполняется…',
  'run.now': 'Запустить сейчас',
  'run.cancel': 'Отмена',
  'run.deleteJob': 'Удалить задачу',
  'run.cannotDelete': 'Нельзя удалить выполняющуюся задачу',
  'run.last': 'Последний запуск:',
  // delete dialog
  'delete.title': 'Удалить задачу?',
  'delete.desc': 'Задача «{name}» будет удалена. Это действие нельзя отменить.',
  // clear dialog
  'clear.title': 'Очистить журнал?',
  'clear.desc': 'Все записи журнала будут удалены. Это действие нельзя отменить.',
  'common.cancel': 'Отмена',
  'common.delete': 'Удалить',
  // status / kinds
  'status.ok': 'Успешно: {n} {word}',
  'status.error': 'Ошибка: {msg}',
  'kind.created': 'создано',
  'kind.updated': 'изменено',
  'kind.deleted': 'удалено',
  'kind.run_ok': 'успех',
  'kind.run_error': 'ошибка',
  'kind.run_cancelled': 'отменено',
  // schedule labels
  'sched.none': 'Без расписания',
  'sched.everyMinutes': 'Каждые {n} мин.',
  'sched.hourly': 'Ежечасно в :{mm}',
  'sched.daily': 'Ежедневно в {hh}:{mm}',
  'sched.weekly': 'Еженедельно ({day}) в {hh}:{mm}',
  'sched.cron': 'Cron: {expr}',
  'weekday.1': 'Пн',
  'weekday.2': 'Вт',
  'weekday.3': 'Ср',
  'weekday.4': 'Чт',
  'weekday.5': 'Пт',
  'weekday.6': 'Сб',
  'weekday.7': 'Вс',
  // editor
  'editor.edit': 'Редактирование задачи',
  'editor.new': 'Новая задача',
  'editor.busy': 'выполняется…',
  'editor.name': 'Название',
  'editor.namePh': 'Например, Документы',
  'editor.group': 'Папка (группа)',
  'editor.groupPh': 'Без группы — оставьте пустым',
  'editor.groupHint': 'Необязательно. Задачи с одинаковой папкой группируются в списке.',
  'editor.sources': 'Источники (файлы и папки)',
  'editor.sourcesEmpty': 'Источники не выбраны',
  'editor.folder': 'Папка',
  'editor.file': 'Файл',
  'editor.output': 'Папка назначения',
  'editor.outputPh': 'Куда копировать',
  'editor.choose': 'Выбрать…',
  'editor.include': 'Маски включения (через запятую)',
  'editor.exclude': 'Маски исключения (через запятую)',
  'editor.enabled': 'Задача включена',
  'editor.useSchedule': 'Выполнять по расписанию',
  'editor.scheduleType': 'Тип расписания',
  'editor.kind.every_minutes': 'Каждые N минут',
  'editor.kind.hourly': 'Ежечасно',
  'editor.kind.daily': 'Ежедневно',
  'editor.kind.weekly': 'Еженедельно',
  'editor.kind.cron': 'Cron-выражение',
  'editor.interval': 'Интервал, минут',
  'editor.minuteOfHour': 'Минута часа',
  'editor.hour': 'Час',
  'editor.minute': 'Минута',
  'editor.weekday': 'День недели',
  'editor.cron': 'Cron (5 полей: мин час день месяц день_недели)',
  'editor.save': 'Сохранить',
  'editor.cancel': 'Отмена',
  'editor.invalid': 'Укажите название, хотя бы один источник и папку назначения',
  'editor.errorNoEnabled': 'Нет включённых задач для запуска.',
}

const en: Record<keyof typeof ru, string> = {
  'app.subtitle': 'File and folder backup',
  'theme.toLight': 'Light theme',
  'theme.toDark': 'Dark theme',
  'job.new': 'New task',
  'banner.hideHint': 'click to hide',
  'banner.hide': 'hide',
  'banner.result': '"{name}": copied {files} ({bytes})',
  'banner.resultErrors': ', errors: {n}',
  'banner.saved': 'Changes saved',
  'banner.cancelled': 'Task "{name}" cancelled',
  'nav.tasks': 'Tasks',
  'nav.journal': 'Journal',
  'nav.settings': 'Settings',
  'tasks.expand': 'Expand tasks',
  'tasks.collapse': 'Collapse tasks',
  'folder.expand': 'Expand folder',
  'folder.collapse': 'Collapse folder',
  'tasks.empty': 'No tasks yet',
  'job.unnamed': '(unnamed)',
  'job.disabled': 'disabled',
  'settings.title': 'Settings',
  'settings.autostart': 'Run at startup',
  'settings.autostartHint': 'Start Backup180 automatically when you log in.',
  'settings.language': 'Interface language',
  'settings.languageHint': 'Language of buttons, menus and the journal.',
  'journal.title': 'Journal',
  'journal.clear': 'Clear',
  'journal.empty': 'Journal is empty.',
  'content.placeholder': 'Select a task on the left or create a new one.',
  'run.running': 'Running…',
  'run.now': 'Run now',
  'run.cancel': 'Cancel',
  'run.deleteJob': 'Delete task',
  'run.cannotDelete': 'Cannot delete a running task',
  'run.last': 'Last run:',
  'delete.title': 'Delete task?',
  'delete.desc': 'Task "{name}" will be deleted. This action cannot be undone.',
  'clear.title': 'Clear journal?',
  'clear.desc': 'All journal entries will be deleted. This action cannot be undone.',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'status.ok': 'Success: {n} {word}',
  'status.error': 'Error: {msg}',
  'kind.created': 'created',
  'kind.updated': 'updated',
  'kind.deleted': 'deleted',
  'kind.run_ok': 'success',
  'kind.run_error': 'error',
  'kind.run_cancelled': 'cancelled',
  'sched.none': 'No schedule',
  'sched.everyMinutes': 'Every {n} min',
  'sched.hourly': 'Hourly at :{mm}',
  'sched.daily': 'Daily at {hh}:{mm}',
  'sched.weekly': 'Weekly ({day}) at {hh}:{mm}',
  'sched.cron': 'Cron: {expr}',
  'weekday.1': 'Mon',
  'weekday.2': 'Tue',
  'weekday.3': 'Wed',
  'weekday.4': 'Thu',
  'weekday.5': 'Fri',
  'weekday.6': 'Sat',
  'weekday.7': 'Sun',
  'editor.edit': 'Edit task',
  'editor.new': 'New task',
  'editor.busy': 'running…',
  'editor.name': 'Name',
  'editor.namePh': 'e.g. Documents',
  'editor.group': 'Folder (group)',
  'editor.groupPh': 'No group — leave empty',
  'editor.groupHint': 'Optional. Tasks with the same folder are grouped in the list.',
  'editor.sources': 'Sources (files and folders)',
  'editor.sourcesEmpty': 'No sources selected',
  'editor.folder': 'Folder',
  'editor.file': 'File',
  'editor.output': 'Destination folder',
  'editor.outputPh': 'Where to copy',
  'editor.choose': 'Choose…',
  'editor.include': 'Include masks (comma-separated)',
  'editor.exclude': 'Exclude masks (comma-separated)',
  'editor.enabled': 'Task enabled',
  'editor.useSchedule': 'Run on schedule',
  'editor.scheduleType': 'Schedule type',
  'editor.kind.every_minutes': 'Every N minutes',
  'editor.kind.hourly': 'Hourly',
  'editor.kind.daily': 'Daily',
  'editor.kind.weekly': 'Weekly',
  'editor.kind.cron': 'Cron expression',
  'editor.interval': 'Interval, minutes',
  'editor.minuteOfHour': 'Minute of hour',
  'editor.hour': 'Hour',
  'editor.minute': 'Minute',
  'editor.weekday': 'Weekday',
  'editor.cron': 'Cron (5 fields: min hour day month weekday)',
  'editor.save': 'Save',
  'editor.cancel': 'Cancel',
  'editor.invalid': 'Provide a name, at least one source and a destination folder',
  'editor.errorNoEnabled': 'No enabled tasks to run.',
}

export type TKey = keyof typeof ru

const dict: Record<Lang, Record<TKey, string>> = { ru, en }

/** Translate a key with optional `{placeholder}` interpolation. */
export function translate(lang: Lang, key: TKey, params?: Record<string, string | number>): string {
  let s = dict[lang][key] ?? dict.ru[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return s
}

/** Plural form for the word "file" in the given language. */
export function pluralFiles(n: number, lang: Lang = 'ru'): string {
  if (lang === 'en') return n === 1 ? 'file' : 'files'
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'файл'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'файла'
  return 'файлов'
}

/** Human-readable byte size, localized units. */
export function formatBytes(bytes: number, lang: Lang = 'ru'): string {
  if (bytes < 1024) return lang === 'en' ? `${bytes} B` : `${bytes} Б`
  const units =
    lang === 'en' ? ['KB', 'MB', 'GB', 'TB'] : ['КБ', 'МБ', 'ГБ', 'ТБ']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(1)} ${units[i]}`
}
