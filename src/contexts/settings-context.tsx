/**
 * User preferences.
 *
 * Small, plain and persisted to AsyncStorage. Kept separate from the library
 * context because preferences change rarely and must survive a cold start,
 * while the library state is rebuilt from SQLite on every launch.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';

import type { SortOrder } from '@/db/photos';

const STORAGE_KEY = 'sift.settings.v1';

export type ThemePreference = 'system' | 'light' | 'dark';

export type Settings = {
  themePreference: ThemePreference;
  /** Tiles per row in the library grid. */
  gridColumns: 2 | 3 | 4;
  sortOrder: SortOrder;
  showFilenames: boolean;
  hapticsEnabled: boolean;
  /** When true the bundled sample photos are part of the index. */
  demoLibrary: boolean;
  /** Optional OCR.space key; empty means text extraction stays switched off. */
  ocrApiKey: string;
  /** Cleared only by a full reset — drives the first-run banner. */
  hasOnboarded: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  themePreference: 'system',
  gridColumns: 3,
  sortOrder: 'newest',
  showFilenames: false,
  hapticsEnabled: true,
  demoLibrary: false,
  ocrApiKey: '',
  hasOnboarded: false,
};

type State = { settings: Settings; ready: boolean };

type Action =
  | { type: 'hydrated'; settings: Settings }
  | { type: 'update'; patch: Partial<Settings> }
  | { type: 'reset' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrated':
      return { settings: action.settings, ready: true };
    case 'update':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'reset':
      return { ...state, settings: { ...DEFAULT_SETTINGS, hasOnboarded: true } };
    default:
      return state;
  }
}

/** Drops unknown keys and repairs bad values from an older install. */
function sanitise(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS;
  const input = raw as Partial<Settings>;
  const columns = Number(input.gridColumns);
  return {
    themePreference: (['system', 'light', 'dark'] as const).includes(input.themePreference as ThemePreference)
      ? (input.themePreference as ThemePreference)
      : DEFAULT_SETTINGS.themePreference,
    gridColumns: (columns === 2 || columns === 3 || columns === 4 ? columns : 3) as Settings['gridColumns'],
    sortOrder: (['newest', 'oldest', 'largest', 'name'] as const).includes(input.sortOrder as SortOrder)
      ? (input.sortOrder as SortOrder)
      : DEFAULT_SETTINGS.sortOrder,
    showFilenames: Boolean(input.showFilenames),
    hapticsEnabled: input.hapticsEnabled !== false,
    demoLibrary: Boolean(input.demoLibrary),
    ocrApiKey: typeof input.ocrApiKey === 'string' ? input.ocrApiKey : '',
    hasOnboarded: Boolean(input.hasOnboarded),
  };
}

type SettingsContextValue = State & {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  ready: false,
  update: () => {},
  reset: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { settings: DEFAULT_SETTINGS, ready: false });

  // Hydrate once on mount. A corrupt or missing record falls back to defaults
  // rather than blocking the app behind an error.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        const parsed = stored ? sanitise(JSON.parse(stored)) : DEFAULT_SETTINGS;
        dispatch({ type: 'hydrated', settings: parsed });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'hydrated', settings: DEFAULT_SETTINGS });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Write through on every change once hydration has finished, so the first
  // render never overwrites stored preferences with the defaults.
  useEffect(() => {
    if (!state.ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings)).catch(() => {
      // Preferences are non-critical; a failed write is retried on next change.
    });
  }, [state.ready, state.settings]);

  const update = useCallback((patch: Partial<Settings>) => dispatch({ type: 'update', patch }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  const value = useMemo(
    () => ({ settings: state.settings, ready: state.ready, update, reset }),
    [state.settings, state.ready, update, reset]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
