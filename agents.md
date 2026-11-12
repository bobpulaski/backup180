# Backup180 — заметки для агентов

Tauri v2 desktop-приложение: Rust-бэкенд (`src-tauri/`) + React/TS фронтенд (`src/`).
Назначение: резервное копирование файлов/папок с масками, расписанием (cron) и автозапуском.

## Что чиним (контекст)

Изначально проект был скелетом под Tauri **v1** с зависимостями **v2** и без половины
файлов. Приводим к рабочему состоянию на **Tauri v2**, сборка на **MSVC** (GNU-цель убрана).
MinGW / C++ Build Tools не нужны.

## TODO / прогресс

- [x] Удалить `.cargo/config.toml` (навязанная GNU-цель)
- [x] `src-tauri/Cargo.toml` → tauri v2 (`tray-icon`), + `tracing`, `tauri-plugin-dialog`, убран `winreg`
- [x] `src-tauri/build.rs` — создан (`tauri_build::build()`)
- [x] `src-tauri/tauri.conf.json` → схема v2 (окна в `app`, без `allowlist`)
- [x] `src-tauri/capabilities/default.json` — создан
- [x] `main.rs` → тонкая обёртка над `backup180_lib::run()`
- [x] `lib.rs` → `run()` в стиле v2 (плагины, state, setup, трей, invoke_handler)
- [x] `tray.rs` → `TrayIconBuilder` + `Menu`/`MenuItem` (v2)
- [x] `commands.rs` → диалоги через `tauri-plugin-dialog`, пути через `app.path()`
- [x] `config.rs` → `app.path().app_config_dir()` и т.п.
- [x] `autostart.rs` → на `tauri-plugin-autostart`
- [x] `scheduler.rs` → `use std::str::FromStr;`, нормализация cron (5→6 полей)
- [x] Фронтенд: `src/main.tsx`, `App.tsx`, `styles.css`, `types.ts`, `api.ts`, `components/JobEditor.tsx`
- [x] `vite.config.ts` — убран несуществующий `tauri-plugin-vite`
- [x] `package.json` — актуализирован
- [x] Иконки-плейсхолдеры: `src-tauri/icons/icon.png` (исходник для `tauri icon`)
- [x] `npm install` (74 пакета)
- [x] `npx tauri icon src-tauri/icons/icon.png` → полный набор иконок
- [x] `npm run build` (фронтенд собрался, `dist/`)
- [x] `cargo build` (Rust, MSVC) — **успешно, без ошибок**
- [x] `npm run tauri dev` — приложение **запускается** (окно открывается, паники нет)
- [ ] `npm run tauri build` → `.exe` + установщики MSI/NSIS (отложено — по запросу)

## Команды

```cmd
npm install
npx tauri icon src-tauri/icons/icon.png
npm run build
cargo build            # из корня (workspace) или из src-tauri
npm run tauri build
```

## Баг-фиксы после ручного теста

- **`backup_engine.rs` (главный баг):** обход использовал `filter_entry(path_matches(...))`,
  где маски файлов применялись и к **папкам** → корневая папка не проходила фильтр `*.docx`,
  обход обрывался на корне, копировалось 0 файлов. Исправлено: папки всегда обходятся
  (отсекаются только явными exclude-масками через `dir_excluded`), а include/exclude-маски
  файлов проверяются функцией `file_matches` против **имени файла** и **относительного пути**
  (слэши нормализованы). Добавлены 6 unit-тестов (все проходят).

## Фронтенд переведён на shadcn/ui (Tailwind + Radix)

- Установлены: `tailwindcss@3.4`, `postcss`, `autoprefixer`, `tailwindcss-animate`,
  `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`,
  Radix-пакеты (`react-dialog`, `react-switch`, `react-label`, `react-select`,
  `react-checkbox`, `react-separator`, `react-slot`, `react-tooltip`).
- Добавлены: `tailwind.config.js`, `postcss.config.js`, `components.json`,
  `src/lib/utils.ts` (`cn`), алиас `@` → `./src` в `vite.config.ts` и `tsconfig.json`.
- UI-компоненты в `src/components/ui/`: button, card, input, label, dialog, switch,
  select, checkbox, separator, badge, tooltip.
- `src/styles.css` переписан: `@tailwind` + CSS-переменные shadcn (тёмная тема).
- `App.tsx` / `JobEditor.tsx` переписаны на эти компоненты.

### Багфиксы UI
- **Удаление без подтверждения:** нативный `window.confirm` в WebView2 возвращает сразу
  true. Заменён на диалог `@radix-ui/react-dialog` (`confirmTarget` + `confirmDelete`).
- **Удаление выполняющейся задачи:** кнопка «Удалить» блокируется, пока `running === job.id`;
  `requestDelete` игнорирует запущенную задачу. Редактор получает проп `busy`, блокирующий
  поля.
- **Выбор папки назначения:** `save_folder` использовал `blocking_save_file` (диалог имени
  файла) → заменён на `blocking_pick_folder` (`commands.rs`).
- **Верстка «не тянется с окном»:** секции контента добавлен `min-w-0`, корню — `w-full
  overflow-hidden`. Flex-потомок без `min-w-0` не сжимается и переполняет окно.
- **Темы (светлая/тёмная):** `src/lib/theme.ts` (`getInitialTheme`/`applyTheme`, класс `.dark`
  на `<html>`, сохранение в `localStorage` ключ `backup180-theme`, фолбэк на OS-преференс).
  В `styles.css` светлые переменные в `:root`, тёмные в `.dark`. Переключатель Sun/Moon в
  топбаре (`theme` state в `App.tsx`). `main.tsx` применяет тему до первого рендера.
- **Персист last_run/last_status:** `run_backup_job` (`commands.rs`) не сохранял статус —
  добавлен async-хелпер `persist_status(...)`, вызывается при успехе и ошибке.
- **События трея:** `App.tsx` слушает `tray-run-backup` и `tray-toggle-autostart` через
  `listen` (`@tauri-apps/api/event`), обработчики в refs. `runAllEnabled()` запускает все
  включённые задачи. `tray.rs` показывает окно перед эмитом.
- **Перевод статуса:** `statusLabel()` в `App.tsx` — `ok: N files` → «Успешно: N файл(а/ов)»
  (плюрализация `pluralFiles`), `error: …` → «Ошибка: …».
- **Самостоятельный сайдбар:** сворачивается в узкую иконную колонку (`w-14`: иконка Задачи +
  иконка Журнал с бейджем-счётчиком) кнопкой `PanelLeft` в топбаре; состояние `sidebarCollapsed`.
  В развёрнутом виде ширина перетаскиванием за ручку (`dragging` ref, глобальные mousemove/
  mouseup, 180–480 px). Значения в `localStorage` (`backup180-sidebar-width`/`-collapsed`).
  Группа «Задачи» раскрывается шевроном (`jobsOpen`, ключ `backup180-jobs-open`); при наведении
  на заголовок появляется кнопка `+` (новая задача). `JobEditor` контейнер — `w-full`.
- **Журнал (Лог):** поле `logs: Vec<LogEntry>` в `AppConfig` (camel не нужен), `LogEntry
  { id, timestamp, kind, message }`, `pub fn push_log(&mut AppConfig, kind, message)` с
  ограничением `MAX_LOG_ENTRIES = 1000` (старые обрезаются). Записи создаются в: `save_job`
  (created/updated), `delete_job` (deleted), `run_backup_job` через `persist_status` (run_ok/
  run_error), `scheduler::job_loop` (run_ok/run_error по расписанию). Команды `load_logs`
  (новые сверху) и `clear_logs`. В сайдбаре пункт «Журнал» (иконка ScrollText, счётчик) под
  группой «Задачи». Вид журнала в контент-секции (`showLog` state), кнопка «Очистить». TS-тип `LogEntry` в `types.ts`, обёртки `loadLogs`/`clearLogs` в `api.ts`.
- **Адаптивная вёрстка:** сайдбар `w-56 sm:w-64 lg:w-72`, редактор `w-full max-w-4xl`,
  поля масок `grid-cols-1 sm:grid-cols-2`, топбар `flex-wrap`, секция `p-4 sm:p-6`.
- **Последний запуск всегда «—»:** `run_backup_job` не персистил `last_run`/`last_status`
  (планировщик персистил, ручная команда — нет). Добавлен async-хелпер `persist_status()`,
  записывающий статус и на успехе, и на ошибке (`commands.rs`).
- **Группы (подпапки) задач:** у `BackupJob` добавлено поле `group: Option<String>`
  (`#[serde(default)]`), в `JobDto`/`SaveJobPayload` — `group`. В `App.tsx` задачи делятся на
  `ungrouped` и `grouped` (Map по имени группы); сгруппированные показываются как сворачиваемые
  папки с шевроном, счётчиком и спиннером при выполнении (состояние `openGroups`, ключ
  `localStorage` `backup180-open-groups`). Элемент списка вынесен в компонент `JobItem`. В
  `JobEditor` — поле «Папка (группа)» с `datalist` подсказок (`groupNames` prop).
- **Пункт трея «Запустить бэкап» ничего не делал:** `tray.rs` эмитил событие
  `tray-run-backup`, но фронтенд его не слушал. В `App.tsx` добавлены `listen('tray-run-backup')`
  и `listen('tray-toggle-autostart')` (через refs, чтобы не устаревали); `runAllEnabled()`
  запускает все включённые задачи последовательно. Трей также показывает окно при запуске.

## Заметки

- Cron-выражения: 5-полевые принимаются, к ним дописывается секунда (`cron` crate).
- Autostart делается через `tauri-plugin-autostart` (не через `winreg`).
- Фронтенд общается через `invoke` (см. `src/api.ts`), типы — `src/types.ts`.

### Локализация (ru/en)

- Бэкенд: `src-tauri/src/i18n.rs` — enum `Lang { Ru, En }`, глобальный `RwLock<Lang>`
  (`set_lang`/`current_lang`), функции всех строк трея и журнала. `src-tauri/src/settings.rs`
  — `AppSettings { language }`, файл `settings.json` в `app_config_dir()`. В setup язык
  ставится до `build_tray`; `tray::update_tray_language` перестраивает меню.
- Команды: `load_settings`, `set_language(app, language)`. В `tray.rs` трей создаётся с
  `.with_id("main")` (не `.id()`), `update_tray_language` находит его через `tray_by_id("main")`.
- Фронтенд: `src/lib/i18n.ts` (словари ru/en, `translate`, `pluralFiles`, тип `TKey`),
  `src/lib/i18n-react.tsx` (`LangProvider`, `useT`). `App.tsx` обёрнут в `LangProvider`,
  все строки через `t(...)`; `JobEditor` — через `useT`. Переключатель языка в «Настройках».
- Файл данных остаётся `backup-jobs.json` (задачи/журнал), язык — отдельно в `settings.json`.
