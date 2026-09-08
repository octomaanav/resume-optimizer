"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme, type ThemeChoice } from "./theme-provider";

const OPTIONS: Array<{
  value: ThemeChoice;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

/** Three-way segmented control: light / system / dark. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={[
              "inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors",
              active
                ? "bg-accent text-on-accent"
                : "text-muted hover:bg-surface-sunken hover:text-foreground",
            ].join(" ")}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
