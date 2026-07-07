import { useSyncExternalStore } from 'react';

/**
 * Minimal i18n store for the webview UI chrome.
 *
 * The language is a persisted per-namespace setting delivered in
 * `settingsLoaded` and changed via the `setLanguage` ClientMessage.
 * Components that render translated strings must call `useLanguage()`
 * so they re-render when the language changes; `t()` then resolves
 * against the current language. Canvas-drawn text and server-generated
 * tool statuses are intentionally not translated here.
 */
export type Language = 'ru' | 'en';

export const DEFAULT_LANGUAGE: Language = 'ru';

const STRINGS = {
  en: {
    newAgent: '+ Agent',
    skipPermissions: 'Skip permissions mode',
    layout: 'Layout',
    layoutTitle: 'Edit office layout',
    settings: 'Settings',
    callAgents: 'Call agents',
    callAgentsTitle: 'Scan for already-running Claude sessions and add them to the office',
    callAgentsSearching: 'Scanning sessions…',
    callAgentsFoundSome: 'Joined:',
    callAgentsFoundNone: 'No new sessions',
    openSessionsFolder: 'Open Sessions Folder',
    exportLayout: 'Export Layout',
    importLayout: 'Import Layout',
    addAssetDirectory: 'Add Asset Directory',
    soundNotifications: 'Sound Notifications',
    watchAllSessions: 'Watch All Sessions',
    instantDetection: 'Instant Detection (Hooks)',
    alwaysShowLabels: 'Always Show Labels',
    debugView: 'Debug View',
    language: 'Language',
    undo: 'Undo',
    redo: 'Redo',
    undoTitle: 'Undo (Ctrl+Z)',
    redoTitle: 'Redo (Ctrl+Y)',
    save: 'Save',
    saveTitle: 'Save layout',
    reset: 'Reset',
    resetTitle: 'Reset to last saved layout',
    resetConfirm: 'Reset?',
    yes: 'Yes',
    no: 'No',
  },
  ru: {
    newAgent: '+ Агент',
    skipPermissions: 'Режим без разрешений',
    layout: 'Планировка',
    layoutTitle: 'Редактировать планировку офиса',
    settings: 'Настройки',
    callAgents: 'Позвать агентов',
    callAgentsTitle: 'Найти уже запущенные сессии Claude и добавить их в офис',
    callAgentsSearching: 'Ищем сессии…',
    callAgentsFoundSome: 'Пришли:',
    callAgentsFoundNone: 'Никого нового',
    openSessionsFolder: 'Открыть папку сессий',
    exportLayout: 'Экспорт планировки',
    importLayout: 'Импорт планировки',
    addAssetDirectory: 'Добавить папку ассетов',
    soundNotifications: 'Звуковые уведомления',
    watchAllSessions: 'Следить за всеми сессиями',
    instantDetection: 'Мгновенное обнаружение (hooks)',
    alwaysShowLabels: 'Всегда показывать подписи',
    debugView: 'Режим отладки',
    language: 'Язык',
    undo: 'Отменить',
    redo: 'Вернуть',
    undoTitle: 'Отменить (Ctrl+Z)',
    redoTitle: 'Вернуть (Ctrl+Y)',
    save: 'Сохранить',
    saveTitle: 'Сохранить планировку',
    reset: 'Сбросить',
    resetTitle: 'Вернуть последнюю сохранённую планировку',
    resetConfirm: 'Сбросить?',
    yes: 'Да',
    no: 'Нет',
  },
} as const satisfies Record<Language, Record<string, string>>;

export type I18nKey = keyof (typeof STRINGS)['en'];

let current: Language = DEFAULT_LANGUAGE;
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return current;
}

export function setLanguage(lang: Language): void {
  if (lang === current) return;
  current = lang;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders the calling component when the language changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage);
}

/** Translate a UI string key using the current language. */
export function t(key: I18nKey): string {
  return STRINGS[current][key];
}
