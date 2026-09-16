import type { BodyMeasurement } from "./types";

/** Un punto de peso en el tiempo. */
export interface WeightPoint {
  date: string;
  weight: number;
}

/** Serie de pesos ordenada de antiguo a reciente, ignorando días sin peso. */
export function weightSeries(measurements: BodyMeasurement[]): WeightPoint[] {
  const points: WeightPoint[] = [];
  for (const measurement of measurements) {
    if (measurement.weight_kg === null) continue;
    points.push({
      date: measurement.measured_on,
      weight: measurement.weight_kg,
    });
  }
  points.sort((left, right) =>
    left.date < right.date ? -1 : left.date > right.date ? 1 : 0,
  );
  return points;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Ruta SVG que encaja los valores en un lienzo de ancho por alto. */
export function sparklinePath(
  values: number[],
  width: number,
  height: number,
): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((value, index) => {
      const x = round(index * step);
      const y = round(height - ((value - min) / span) * height);
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}
