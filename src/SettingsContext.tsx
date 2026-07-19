// src/SettingsContext.tsx
// App settings: default tip percent and lifetime scan counter (free-scan gate).
// Persisted via expo-sqlite/kv-store (same API as AsyncStorage, but backed
// by SQLite we already ship — no separate native dependency to version-match).

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import Storage from 'expo-sqlite/kv-store';

const KEY = 'tally.settings.v1';

export interface Settings {
  defaultTipPct: number;
  scansUsed: number;
}

const DEFAULTS: Settings = {
  defaultTipPct: 20,
  scansUsed: 0,
};

interface Ctx {
  settings: Settings;
  loaded: boolean;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<Ctx>({
  settings: DEFAULTS,
  loaded: false,
  update: () => {},
});

export function SettingsProvider(props: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Storage.getItem(KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Settings>;
          setSettings({ ...DEFAULTS, ...parsed });
        }
      })
      .catch((e) => console.warn('settings load failed', e))
      .finally(() => setLoaded(true));
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      Storage.setItem(KEY, JSON.stringify(next)).catch((e) =>
        console.warn('settings save failed', e),
      );
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loaded, update }}>
      {props.children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
