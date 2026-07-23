"use client";

import { useEffect, useState } from "react";
import { IconSun, IconMoon } from "./icons";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("mhz_theme") as "light" | "dark" | null;
    const initial = stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("mhz_theme", next);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Alternar tema"
      className="h-8 w-8 rounded-lg flex items-center justify-center transition"
      style={{ color: "var(--text-muted)" }}
    >
      {theme === "dark" ? <IconSun className="h-4 w-4" /> : <IconMoon className="h-4 w-4" />}
    </button>
  );
}
