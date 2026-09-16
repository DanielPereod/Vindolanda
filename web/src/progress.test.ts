import { expect, test } from "vitest";
import { sparklinePath, weightSeries } from "./progress";
import type { BodyMeasurement } from "./types";

function measurement(
  measured_on: string,
  weight_kg: number | null,
): BodyMeasurement {
  return {
    id: measured_on,
    measured_on,
    weight_kg,
    body_fat_pct: null,
    waist_cm: null,
    hip_cm: null,
    chest_cm: null,
    neck_cm: null,
    arm_cm: null,
    thigh_cm: null,
    notes: "",
    created_at: "",
    updated_at: "",
  };
}

test("weightSeries sorts ascending and ignores entries without weight", () => {
  const series = weightSeries([
    measurement("2026-09-10", 80),
    measurement("2026-09-01", 81),
    measurement("2026-09-05", null),
  ]);
  expect(series).toEqual([
    { date: "2026-09-01", weight: 81 },
    { date: "2026-09-10", weight: 80 },
  ]);
});

test("sparklinePath maps the value range into the box", () => {
  expect(sparklinePath([80, 82], 100, 50)).toBe("M0,50 L100,0");
  expect(sparklinePath([], 100, 50)).toBe("");
  expect(sparklinePath([75], 100, 50)).toBe("M0,50");
});
