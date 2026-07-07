import { useEffect, useRef, useState } from 'react';

import type { WorkspaceFolder } from '../hooks/useExtensionMessages.js';
import { t, useLanguage } from '../i18n.js';
import { isBrowserRuntime } from '../runtime.js';
import { transport } from '../transport/index.js';
import { Button } from './ui/Button.js';
import { Dropdown, DropdownItem } from './ui/Dropdown.js';

const DISCOVER_MIN_SEARCH_MS = 500;
const DISCOVER_RESULT_SHOWN_MS = 3000;
const DISCOVER_TIMEOUT_MS = 10_000;

interface BottomToolbarProps {
  isEditMode: boolean;
  onOpenClaude: () => void;
  onToggleEditMode: () => void;
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
  workspaceFolders: WorkspaceFolder[];
}

export function BottomToolbar({
  isEditMode,
  onOpenClaude,
  onToggleEditMode,
  isSettingsOpen,
  onToggleSettings,
  workspaceFolders,
}: BottomToolbarProps) {
  useLanguage();
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [isBypassMenuOpen, setIsBypassMenuOpen] = useState(false);
  const folderPickerRef = useRef<HTMLDivElement>(null);
  const pendingBypassRef = useRef(false);
  // «Позвать агентов»: idle → searching → result (число найденных) → idle
  const [discoverState, setDiscoverState] = useState<'idle' | 'searching' | number>('idle');
  const discoverStartedAtRef = useRef(0);
  const discoverTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const unsubscribe = transport.onMessage((msg) => {
      if (msg.type !== 'discoverResult') return;
      const found = (msg as { found?: number }).found ?? 0;
      // Скан быстрый — подержим «Ищем…» хотя бы полсекунды, чтобы статус читался.
      const elapsed = Date.now() - discoverStartedAtRef.current;
      const reveal = Math.max(0, DISCOVER_MIN_SEARCH_MS - elapsed);
      discoverTimersRef.current.push(
        setTimeout(() => {
          setDiscoverState(found);
          discoverTimersRef.current.push(
            setTimeout(() => setDiscoverState('idle'), DISCOVER_RESULT_SHOWN_MS),
          );
        }, reveal),
      );
    });
    const timers = discoverTimersRef.current;
    return () => {
      unsubscribe();
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  const handleDiscoverClick = () => {
    if (discoverState !== 'idle') return;
    discoverStartedAtRef.current = Date.now();
    setDiscoverState('searching');
    transport.send({ type: 'discoverAgents' });
    // Страховка: если ответ не пришёл, вернуть кнопку в норму.
    discoverTimersRef.current.push(
      setTimeout(
        () => setDiscoverState((st) => (st === 'searching' ? 'idle' : st)),
        DISCOVER_TIMEOUT_MS,
      ),
    );
  };

  const discoverLabel =
    discoverState === 'idle'
      ? t('callAgents')
      : discoverState === 'searching'
        ? t('callAgentsSearching')
        : discoverState > 0
          ? `${t('callAgentsFoundSome')} ${discoverState}`
          : t('callAgentsFoundNone');
  // Close folder picker / bypass menu on outside click
  useEffect(() => {
    if (!isFolderPickerOpen && !isBypassMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node)) {
        setIsFolderPickerOpen(false);
        setIsBypassMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isFolderPickerOpen, isBypassMenuOpen]);

  const hasMultipleFolders = workspaceFolders.length > 1;

  const handleAgentClick = () => {
    setIsBypassMenuOpen(false);
    pendingBypassRef.current = false;
    if (hasMultipleFolders) {
      setIsFolderPickerOpen((v) => !v);
    } else {
      onOpenClaude();
    }
  };

  const handleAgentHover = () => {
    if (!isFolderPickerOpen) {
      setIsBypassMenuOpen(true);
    }
  };

  const handleAgentLeave = () => {
    if (!isFolderPickerOpen) {
      setIsBypassMenuOpen(false);
    }
  };

  const handleFolderSelect = (folder: WorkspaceFolder) => {
    setIsFolderPickerOpen(false);
    const bypassPermissions = pendingBypassRef.current;
    pendingBypassRef.current = false;
    transport.send({ type: 'launchAgent', folderPath: folder.path, bypassPermissions });
  };

  const handleBypassSelect = (bypassPermissions: boolean) => {
    setIsBypassMenuOpen(false);
    if (hasMultipleFolders) {
      pendingBypassRef.current = bypassPermissions;
      setIsFolderPickerOpen(true);
    } else {
      transport.send({ type: 'launchAgent', bypassPermissions });
    }
  };

  return (
    <div className="absolute bottom-10 left-10 z-20 flex items-center gap-4 pixel-panel p-4">
      {/* Hide + Agent in standalone browser mode (no terminal to interact with) */}
      {!isBrowserRuntime && (
        <div
          ref={folderPickerRef}
          className="relative"
          onMouseEnter={handleAgentHover}
          onMouseLeave={handleAgentLeave}
        >
          <Button
            variant="accent"
            onClick={handleAgentClick}
            className={
              isFolderPickerOpen || isBypassMenuOpen
                ? 'bg-accent-bright'
                : 'bg-accent hover:bg-accent-bright'
            }
          >
            {t('newAgent')}
          </Button>
          <Dropdown isOpen={isBypassMenuOpen}>
            <DropdownItem onClick={() => handleBypassSelect(true)}>
              {t('skipPermissions')} <span className="text-2xs text-warning">⚠</span>
            </DropdownItem>
          </Dropdown>
          <Dropdown isOpen={isFolderPickerOpen} className="min-w-128">
            {workspaceFolders.map((folder) => (
              <DropdownItem
                key={folder.path}
                onClick={() => handleFolderSelect(folder)}
                className="text-base"
              >
                {folder.name}
              </DropdownItem>
            ))}
          </Dropdown>
        </div>
      )}
      <Button
        variant={discoverState === 'idle' ? 'default' : 'active'}
        onClick={handleDiscoverClick}
        title={t('callAgentsTitle')}
        className={discoverState === 'searching' ? 'pixel-pulse' : undefined}
      >
        {discoverLabel}
      </Button>
      <Button
        variant={isEditMode ? 'active' : 'default'}
        onClick={onToggleEditMode}
        title={t('layoutTitle')}
      >
        {t('layout')}
      </Button>
      <Button
        variant={isSettingsOpen ? 'active' : 'default'}
        onClick={onToggleSettings}
        title={t('settings')}
      >
        {t('settings')}
      </Button>
    </div>
  );
}
