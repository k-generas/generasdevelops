// Theme constants (kept separate from ThemeProvider so component fast-refresh
// stays clean).

export type ThemeMode = "light" | "dark" | "system";
export type Accent =
  | "gold"
  | "orange"
  | "red"
  | "rose"
  | "pink"
  | "violet"
  | "indigo"
  | "blue"
  | "cyan"
  | "teal"
  | "emerald"
  | "lime";

export const ACCENTS: { value: Accent; label: string; dot: string }[] = [
  { value: "emerald", label: "Emerald", dot: "#34d399" },
  { value: "gold", label: "Gold", dot: "#fbbf24" },
  { value: "lime", label: "Lime", dot: "#a3e635" },
  { value: "teal", label: "Teal", dot: "#2dd4bf" },
  { value: "cyan", label: "Cyan", dot: "#22d3ee" },
  { value: "blue", label: "Blue", dot: "#60a5fa" },
  { value: "indigo", label: "Indigo", dot: "#818cf8" },
  { value: "violet", label: "Violet", dot: "#a78bfa" },
  { value: "pink", label: "Pink", dot: "#f472b6" },
  { value: "rose", label: "Rose", dot: "#fb7185" },
  { value: "red", label: "Red", dot: "#f87171" },
  { value: "orange", label: "Orange", dot: "#fb923c" },
];

export const ACCENT_VALUES = ACCENTS.map((a) => a.value) as readonly Accent[];

export const MODE_KEY = "gare:theme-mode";
export const ACCENT_KEY = "gare:theme-accent";

export const DEFAULT_MODE: ThemeMode = "light";
export const DEFAULT_ACCENT: Accent = "emerald";

// Runs before paint (see __root.tsx) to apply the saved theme without a flash.
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('${MODE_KEY}')||'${DEFAULT_MODE}';var a=localStorage.getItem('${ACCENT_KEY}')||'${DEFAULT_ACCENT}';var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.setAttribute('data-accent',a);}catch(_){}})();`;
