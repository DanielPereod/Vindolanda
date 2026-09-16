import { expect, test } from "vitest";
import { localDate, isOverdue, shiftDate, mondayOf } from "./dates";
test("today follows the account timezone across UTC midnight", () => {
  expect(localDate("Europe/Madrid", new Date("2026-09-14T22:30:00Z"))).toBe(
    "2026-09-15",
  );
});
test("date-only tasks are overdue on the following day", () => {
  expect(
    isOverdue(
      "2026-09-15",
      null,
      "Europe/Madrid",
      new Date("2026-09-15T20:00:00Z"),
    ),
  ).toBe(false);
  expect(
    isOverdue(
      "2026-09-14",
      null,
      "Europe/Madrid",
      new Date("2026-09-15T20:00:00Z"),
    ),
  ).toBe(true);
});
test("timed tasks become overdue in local wall time", () => {
  expect(
    isOverdue(
      "2026-09-15",
      "18:00",
      "Europe/Madrid",
      new Date("2026-09-15T16:01:00Z"),
    ),
  ).toBe(true);
});

test("clock formatting honors the selected 12-hour format", async () => {
  const { formatTime } = await import("./dates");
  expect(formatTime("18:30:00", "12")).toBe("6:30 p. m.");
  expect(formatTime("00:05", "24")).toBe("00:05");
});

test("day navigation crosses month and year boundaries", () => {
  expect(shiftDate("2026-09-16", 1)).toBe("2026-09-17");
  expect(shiftDate("2026-09-01", -1)).toBe("2026-08-31");
  expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
});

test("week start snaps to Monday", () => {
  expect(mondayOf("2026-09-16")).toBe("2026-09-14");
  expect(mondayOf("2026-09-20")).toBe("2026-09-14");
  expect(mondayOf("2026-09-21")).toBe("2026-09-21");
});
