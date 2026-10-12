import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  ACCENT_VALUES,
  ACCENT_KEY,
  MODE_KEY,
  type Accent,
  type ThemeMode,
} from "./theme-constants";

type ThemeState = {
  mode: ThemeMode;
  accent: Accent;
  resolvedDark: boolean;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: Accent) => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

function readMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const v = window.localStorage.getItem(MODE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "dark";
}

function readAccent(): Accent {
  if (typeof window === "undefined") return "gold";
  const v = window.localStorage.getItem(ACCENT_KEY);
  return ACCENT_VALUES.includes(v as Accent) ? (v as Accent) : "gold";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [accent, setAccentState] = useState<Accent>(readAccent);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const resolvedDark = mode === "system" ? systemDark : mode === "dark";

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedDark);
    root.setAttribute("data-accent", accent);
  }, [resolvedDark, accent]);

  const setMode = useCallback((m: ThemeMode) => {
    window.localStorage.setItem(MODE_KEY, m);
    setModeState(m);
  }, []);

  const setAccent = useCallback((a: Accent) => {
    window.localStorage.setItem(ACCENT_KEY, a);
    setAccentState(a);
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, accent, resolvedDark, setMode, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
