import { useState } from 'react';

import type { Language } from '../i18n.js';
import { getLanguage, setLanguage, t, useLanguage } from '../i18n.js';
import { isSoundEnabled, setSoundEnabled } from '../notificationSound.js';
import { transport } from '../transport/index.js';
import { Button } from './ui/Button.js';
import { Checkbox } from './ui/Checkbox.js';
import { MenuItem } from './ui/MenuItem.js';
import { Modal } from './ui/Modal.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
  alwaysShowOverlay: boolean;
  onToggleAlwaysShowOverlay: () => void;
  externalAssetDirectories: string[];
  watchAllSessions: boolean;
  onToggleWatchAllSessions: () => void;
  hooksEnabled: boolean;
  onToggleHooksEnabled: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  isDebugMode,
  onToggleDebugMode,
  alwaysShowOverlay,
  onToggleAlwaysShowOverlay,
  externalAssetDirectories,
  watchAllSessions,
  onToggleWatchAllSessions,
  hooksEnabled,
  onToggleHooksEnabled,
}: SettingsModalProps) {
  useLanguage();
  const [soundLocal, setSoundLocal] = useState(isSoundEnabled);

  const chooseLanguage = (lang: Language) => {
    if (lang === getLanguage()) return;
    setLanguage(lang);
    transport.send({ type: 'setLanguage', language: lang });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('settings')}>
      <div className="flex items-center justify-between py-4 px-10 gap-8">
        <span className="text-base">{t('language')}</span>
        <div className="flex gap-4">
          <Button
            variant={getLanguage() === 'ru' ? 'active' : 'default'}
            size="sm"
            onClick={() => chooseLanguage('ru')}
          >
            Русский
          </Button>
          <Button
            variant={getLanguage() === 'en' ? 'active' : 'default'}
            size="sm"
            onClick={() => chooseLanguage('en')}
          >
            English
          </Button>
        </div>
      </div>
      <MenuItem
        onClick={() => {
          transport.send({ type: 'openSessionsFolder' });
          onClose();
        }}
      >
        {t('openSessionsFolder')}
      </MenuItem>
      <MenuItem
        onClick={() => {
          transport.send({ type: 'exportLayout' });
          onClose();
        }}
      >
        {t('exportLayout')}
      </MenuItem>
      <MenuItem
        onClick={() => {
          transport.send({ type: 'importLayout' });
          onClose();
        }}
      >
        {t('importLayout')}
      </MenuItem>
      <MenuItem
        onClick={() => {
          transport.send({ type: 'addExternalAssetDirectory' });
          onClose();
        }}
      >
        {t('addAssetDirectory')}
      </MenuItem>
      {externalAssetDirectories.map((dir) => (
        <div key={dir} className="flex items-center justify-between py-4 px-10 gap-8">
          <span
            className="text-xs text-text-muted overflow-hidden text-ellipsis whitespace-nowrap"
            title={dir}
          >
            {dir.split(/[/\\]/).pop() ?? dir}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => transport.send({ type: 'removeExternalAssetDirectory', path: dir })}
            className="shrink-0"
          >
            x
          </Button>
        </div>
      ))}
      <Checkbox
        label={t('soundNotifications')}
        checked={soundLocal}
        onChange={() => {
          const newVal = !isSoundEnabled();
          setSoundEnabled(newVal);
          setSoundLocal(newVal);
          transport.send({ type: 'setSoundEnabled', enabled: newVal });
        }}
      />
      <Checkbox
        label={t('watchAllSessions')}
        checked={watchAllSessions}
        onChange={onToggleWatchAllSessions}
      />
      <Checkbox
        label={t('instantDetection')}
        checked={hooksEnabled}
        onChange={onToggleHooksEnabled}
      />
      <Checkbox
        label={t('alwaysShowLabels')}
        checked={alwaysShowOverlay}
        onChange={onToggleAlwaysShowOverlay}
      />
      <Checkbox label={t('debugView')} checked={isDebugMode} onChange={onToggleDebugMode} />
    </Modal>
  );
}
