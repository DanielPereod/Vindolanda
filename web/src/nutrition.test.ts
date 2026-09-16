import { describe, expect, it } from "vitest";
import { basalMetabolicRate, previewTargets } from "./nutrition";

describe("basalMetabolicRate", () => {
  it("uses the Mifflin-St Jeor formula for each sex", () => {
    expect(
      basalMetabolicRate({
        weight_kg: 80,
        height_cm: 180,
        age: 30,
        sex: "male",
      }),
    ).toBe(1780);
    expect(
      basalMetabolicRate({
        weight_kg: 60,
        height_cm: 165,
        age: 25,
        sex: "female",
      }),
    ).toBe(1345.25);
    expect(
      basalMetabolicRate({
        weight_kg: 60,
        height_cm: 165,
        age: 25,
        sex: "other",
      }),
    ).toBe(1428.25);
  });
});

describe("previewTargets", () => {
  it("matches the API calculation", () => {
    expect(
      previewTargets({
        weight_kg: 80,
        height_cm: 180,
        age: 30,
        sex: "male",
        activity_level: "moderate",
        goal: "lose",
      }),
    ).toEqual({
      calories: 2345,
      protein_g: 205,
      carbs_g: 205,
      fat_g: 78,
      fiber_g: 33,
      water_ml: 2800,
    });
  });

  it("returns null when the profile lacks data", () => {
    expect(
      previewTargets({
        weight_kg: 0,
        height_cm: 180,
        age: 30,
        sex: "male",
        activity_level: "moderate",
        goal: "lose",
      }),
    ).toBeNull();
  });
});
