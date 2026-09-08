"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "ro-theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

/*
 * Theme lives in two external stores — localStorage (the user's choice) and
 * the OS media query (what "system" currently means). useSyncExternalStore
 * reads both directly, so there is no setState-in-effect and no extra render
 * pass on mount.
 */

function readStoredChoice(): ThemeChoice {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Private mode or blocked storage — fall through to the default.
  }
  return "system";
}

let cachedChoice: ThemeChoice | null = null;
const choiceListeners = new Set<() => void>();

function getChoiceSnapshot(): ThemeChoice {
  cachedChoice ??= readStoredChoice();
  return cachedChoice;
}

function subscribeChoice(onChange: () => void) {
  choiceListeners.add(onChange);
  // Keep other tabs in sync.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    cachedChoice = readStoredChoice();
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    choiceListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function writeChoice(next: ThemeChoice) {
  cachedChoice = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Non-fatal: the theme still applies for this session.
  }
  for (const listener of choiceListeners) listener();
}

function getSystemSnapshot(): ResolvedTheme {
  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function subscribeSystem(onChange: () => void) {
  const mq = window.matchMedia(MEDIA_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

type ThemeContextValue = {
  /** What the user picked, including "system". */
  theme: ThemeChoice;
  /** What is actually painted right now. */
  resolved: ResolvedTheme;
  setTheme: (next: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Server snapshots match themeInitScript's pre-hydration default.
  const theme = useSyncExternalStore(
    subscribeChoice,
    getChoiceSnapshot,
    () => "system" as ThemeChoice,
  );
  const system = useSyncExternalStore(
    subscribeSystem,
    getSystemSnapshot,
    () => "light" as ResolvedTheme,
  );

  const resolved: ResolvedTheme = theme === "system" ? system : theme;

  // Syncing an external system (the DOM) — the intended use of an effect.
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const setTheme = useCallback((next: ThemeChoice) => writeChoice(next), []);

  const value = useMemo(
    () => ({ theme, resolved, setTheme }),
    [theme, resolved, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

/**
 * Runs before first paint to stamp data-theme on <html>, so there is no flash
 * of the wrong theme. Kept in sync with readStoredChoice/getSystemSnapshot.
 */
export const themeInitScript = `
(function(){
  try {
    var s = localStorage.getItem("${STORAGE_KEY}");
    var t = (s === "light" || s === "dark")
      ? s
      : (window.matchMedia("${MEDIA_QUERY}").matches ? "dark" : "light");
    document.documentElement.dataset.theme = t;
  } catch (e) {
    document.documentElement.dataset.theme = "light";
  }
})();
`.trim();
