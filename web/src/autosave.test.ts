import { describe, expect, it } from "vitest";
import { createSaveQueue } from "./autosave";

describe("serialized document saves", () => {
  it("serializes writes and preserves the latest queued draft", async () => {
    const writes: string[] = [];
    let release: (() => void) | undefined;
    const queue = createSaveQueue(async (value: string) => {
      writes.push(value);
      if (value === "first")
        await new Promise<void>((resolve) => {
          release = resolve;
        });
    });
    const first = queue("first");
    const second = queue("second");
    expect(writes).toEqual(["first"]);
    release?.();
    await Promise.all([first, second]);
    expect(writes).toEqual(["first", "second"]);
  });
  it("allows retry after a rejected save", async () => {
    let attempts = 0;
    const queue = createSaveQueue(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
    });
    await expect(queue("draft")).rejects.toThrow("offline");
    await expect(queue("draft")).resolves.toBeUndefined();
  });
});
