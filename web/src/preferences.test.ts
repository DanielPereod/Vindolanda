import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTES_PREFERENCES,
  DEFAULT_NUTRITION_PREFERENCES,
  isCalendarMode,
  loadCalendarMode,
  loadNotesPreferences,
  loadNutritionPreferences,
  saveCalendarMode,
  saveNotesPreferences,
  saveNutritionPreferences,
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

describe("notes preferences", () => {
  it("enables discard confirmation by default", () => {
    expect(loadNotesPreferences(null)).toEqual(DEFAULT_NOTES_PREFERENCES);
  });

  it("honours a persisted boolean", () => {
    const storage = memoryStorage({
      "notes-preferences": JSON.stringify({ confirmDiscard: false }),
    });
    expect(loadNotesPreferences(storage).confirmDiscard).toBe(false);
  });

  it("recovers from corrupt JSON", () => {
    const storage = memoryStorage({ "notes-preferences": "{not json" });
    expect(loadNotesPreferences(storage)).toEqual(DEFAULT_NOTES_PREFERENCES);
  });

  it("persists changes", () => {
    const storage = memoryStorage();
    saveNotesPreferences({ confirmDiscard: false }, storage);
    expect(loadNotesPreferences(storage).confirmDiscard).toBe(false);
  });
});

describe("nutrition preferences", () => {
  it("defaults to grams", () => {
    expect(loadNutritionPreferences(null)).toEqual(
      DEFAULT_NUTRITION_PREFERENCES,
    );
  });

  it("rejects an unsupported unit", () => {
    const storage = memoryStorage({
      "nutrition-preferences": JSON.stringify({ defaultBaseUnit: "oz" }),
    });
    expect(loadNutritionPreferences(storage).defaultBaseUnit).toBe("g");
  });

  it("round-trips a saved unit", () => {
    const storage = memoryStorage();
    saveNutritionPreferences({ defaultBaseUnit: "ml" }, storage);
    expect(loadNutritionPreferences(storage).defaultBaseUnit).toBe("ml");
  });
});

describe("isCalendarMode", () => {
  it("accepts supported modes and rejects others", () => {
    expect(isCalendarMode("week")).toBe(true);
    expect(isCalendarMode("quarter")).toBe(false);
  });
});
