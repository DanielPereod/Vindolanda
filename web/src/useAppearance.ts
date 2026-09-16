import { useEffect } from "react";
import type { Settings } from "./types";
import { resolveAccentColor } from "./appearance";

/** Applies account appearance, including changes to the system color scheme. */
export function useAppearance(settings: Settings | undefined) {
  useEffect(() => {
    if (!settings) return;
    document.documentElement.style.setProperty(
      "--accent",
      resolveAccentColor(settings.accent_color),
    );
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.dataset.theme =
        settings.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : settings.theme;
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [settings]);
}
