export const ACCENT_OPTIONS = [
  { name: "Azul", value: "#2563eb" },
  { name: "Violeta", value: "#7c3aed" },
  { name: "Verde", value: "#15803d" },
  { name: "Naranja", value: "#c2410c" },
  { name: "Rosa", value: "#be123c" },
] as const;

export type AccentColor = (typeof ACCENT_OPTIONS)[number]["value"];

/** Returns a supported accent, protecting the UI from stale persisted values. */
export function resolveAccentColor(value: string): AccentColor {
  const option = ACCENT_OPTIONS.find((candidate) => candidate.value === value);
  return option?.value ?? ACCENT_OPTIONS[0].value;
}
