"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { SettingsModal, type SettingsTone } from "./SettingsModal";

interface SettingsContextValue {
  openSettings: (tone?: SettingsTone) => void;
  closeSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<{ open: boolean; tone: SettingsTone }>({
    open: false,
    tone: "light",
  });

  useEffect(() => {
    try {
      const theme = window.localStorage.getItem("zm.preferences.theme");
      if (theme) document.documentElement.dataset.zoomTheme = theme;
    } catch {
      // Hardened/private browsers may disable storage; API preferences still work.
    }
  }, []);

  const openSettings = useCallback((tone: SettingsTone = "light") => {
    setDialog({ open: true, tone });
  }, []);
  const closeSettings = useCallback(() => {
    setDialog((current) => ({ ...current, open: false }));
  }, []);
  const value = useMemo(
    () => ({ openSettings, closeSettings }),
    [openSettings, closeSettings],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
      {dialog.open ? (
        <SettingsModal
          open
          tone={dialog.tone}
          onClose={closeSettings}
        />
      ) : null}
    </SettingsContext.Provider>
  );
}

const NOOP_SETTINGS: SettingsContextValue = {
  openSettings: () => {},
  closeSettings: () => {},
};

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext) ?? NOOP_SETTINGS;
}
