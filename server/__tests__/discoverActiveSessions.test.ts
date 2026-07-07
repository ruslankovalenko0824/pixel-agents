import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// fileWatcher.ts does `import * as vscode from 'vscode'` at module load; stub the
// APIs it touches so the module loads under vitest (see fileWatcherDismissal.test.ts).
vi.mock('vscode', () => ({
  window: {
    activeTerminal: undefined,
    terminals: [],
  },
}));

import type { HookProvider } from '../../core/src/provider.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { GLOBAL_SCAN_ACTIVE_MAX_AGE_MS, GLOBAL_SCAN_ACTIVE_MIN_SIZE } from '../src/constants.js';
import { DismissalTracker } from '../src/dismissalTracker.js';
import {
  discoverActiveSessions,
  setDismissalTracker,
  setHookProvider,
} from '../src/fileWatcher.js';

/** A transcript comfortably above the GLOBAL_SCAN_ACTIVE_MIN_SIZE activity filter. */
function activeContent(): string {
  return '{"type":"assistant"}\n'.repeat(GLOBAL_SCAN_ACTIVE_MIN_SIZE / 10);
}

describe('discoverActiveSessions (the "Call agents" one-shot scan)', () => {
  let tmpRoot: string;
  let projectDir: string;
  let tracker: DismissalTracker;
  let knownJsonlFiles: Set<string>;
  let nextAgentIdRef: { current: number };
  let agents: AgentStateStore;
  let fileWatchers: Map<number, fs.FSWatcher>;
  let pollingTimers: Map<number, ReturnType<typeof setInterval>>;
  let waitingTimers: Map<number, ReturnType<typeof setTimeout>>;
  let permissionTimers: Map<number, ReturnType<typeof setTimeout>>;

  function runDiscover(): number {
    return discoverActiveSessions(
      knownJsonlFiles,
      nextAgentIdRef,
      agents,
      fileWatchers,
      pollingTimers,
      waitingTimers,
      permissionTimers,
      () => {},
    );
  }

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-discover-'));
    projectDir = path.join(tmpRoot, '-Users-someone-project');
    fs.mkdirSync(projectDir);

    tracker = new DismissalTracker();
    setDismissalTracker(tracker);
    setHookProvider({
      getAllSessionRoots: () => [tmpRoot],
    } as unknown as HookProvider);

    knownJsonlFiles = new Set();
    nextAgentIdRef = { current: 1 };
    agents = new AgentStateStore();
    fileWatchers = new Map();
    pollingTimers = new Map();
    waitingTimers = new Map();
    permissionTimers = new Map();
  });

  afterEach(() => {
    for (const w of fileWatchers.values()) w.close();
    for (const t of pollingTimers.values()) clearInterval(t);
    for (const t of waitingTimers.values()) clearTimeout(t);
    for (const t of permissionTimers.values()) clearTimeout(t);
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('adopts a recently-active transcript even when it was seeded at startup', () => {
    const file = path.join(projectDir, 'aaaa-bbbb.jsonl');
    fs.writeFileSync(file, activeContent());
    // Simulate startup seeding — the periodic scanners would skip this file.
    tracker.seedMtime(file, fs.statSync(file).mtimeMs);

    const adopted = runDiscover();

    expect(adopted).toBe(1);
    const all = [...agents.values()];
    expect(all).toHaveLength(1);
    expect(all[0].jsonlFile).toBe(file);
    expect(all[0].isExternal).toBe(true);
    expect(all[0].folderName).toBe('project');
  });

  it('is idempotent: a second run adopts nothing new', () => {
    const file = path.join(projectDir, 'aaaa-bbbb.jsonl');
    fs.writeFileSync(file, activeContent());

    expect(runDiscover()).toBe(1);
    expect(runDiscover()).toBe(0);
    expect([...agents.values()]).toHaveLength(1);
  });

  it('skips stale and tiny transcripts', () => {
    const stale = path.join(projectDir, 'stale.jsonl');
    fs.writeFileSync(stale, activeContent());
    const old = (Date.now() - GLOBAL_SCAN_ACTIVE_MAX_AGE_MS - 60_000) / 1000;
    fs.utimesSync(stale, old, old);

    const tiny = path.join(projectDir, 'tiny.jsonl');
    fs.writeFileSync(tiny, '{"type":"assistant"}\n');

    expect(runDiscover()).toBe(0);
    expect([...agents.values()]).toHaveLength(0);
  });

  it('respects user dismissals', () => {
    const file = path.join(projectDir, 'dismissed.jsonl');
    fs.writeFileSync(file, activeContent());
    tracker.dismiss(file);

    expect(runDiscover()).toBe(0);
  });
});
