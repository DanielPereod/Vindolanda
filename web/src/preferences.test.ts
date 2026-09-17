import { describe, expect, it } from "vitest";
import {
  isCalendarMode,
  loadCalendarMode,
  saveCalendarMode,
} from "./preferences";
import type { PreferenceStorage } from "./preferences";

function memoryStorage(seed: Record<string, string> = {}): PreferenceStorage {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("calendar mode", () => {
  it("falls back to the month view without storage", () => {
    expect(loadCalendarMode(null)).toBe("month");
  });

  it("migrates the legacy 3day value to multiday", () => {
    expect(loadCalendarMode(memoryStorage({ "calendar-mode": "3day" }))).toBe(
      "multiday",
    );
  });

  it("ignores unknown persisted values", () => {
    expect(
      loadCalendarMode(memoryStorage({ "calendar-mode": "quarter" })),
    ).toBe("month");
  });

  it("round-trips a saved mode", () => {
    const storage = memoryStorage();
    saveCalendarMode("agenda", storage);
    expect(loadCalendarMode(storage)).toBe("agenda");
  });
});

describe("isCalendarMode", () => {
  it("accepts supported modes and rejects others", () => {
    expect(isCalendarMode("week")).toBe(true);
    expect(isCalendarMode("quarter")).toBe(false);
  });
});
