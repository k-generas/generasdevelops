import { Check, Monitor, Moon, Palette, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { ACCENTS, type ThemeMode } from "@/lib/theme-constants";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MODES: { value: ThemeMode; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeMenu({ align = "end" }: { align?: "start" | "end" }) {
  const { mode, accent, setMode, setAccent } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title="Theme"
          aria-label="Theme"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Palette className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64 p-2">
        <DropdownMenuLabel className="px-1.5">Appearance</DropdownMenuLabel>
        <div className="grid grid-cols-3 gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px] font-medium transition-colors",
                mode === m.value
                  ? "border-primary bg-secondary text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <m.icon className="h-4 w-4" />
              {m.label}
            </button>
          ))}
        </div>

        <DropdownMenuSeparator className="my-2" />
        <DropdownMenuLabel className="px-1.5">Accent</DropdownMenuLabel>
        <div className="grid grid-cols-6 gap-2 px-1 pb-1">
          {ACCENTS.map((a) => (
            <button
              key={a.value}
              type="button"
              title={a.label}
              aria-label={a.label}
              onClick={() => setAccent(a.value)}
              style={{ backgroundColor: a.dot }}
              className={cn(
                "grid h-6 w-full place-items-center rounded-full outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring",
                accent === a.value
                  ? "ring-2 ring-foreground ring-offset-2 ring-offset-popover"
                  : "ring-1 ring-inset ring-black/10",
              )}
            >
              {accent === a.value && <Check className="h-3.5 w-3.5 text-black/70" />}
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
