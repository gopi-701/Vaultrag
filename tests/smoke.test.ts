import { describe, expect, it } from "vitest";

describe("project foundation", () => {
  it("loads the application test environment", async () => {
    await expect(import("@/lib/env")).resolves.toBeDefined();
  });
});
