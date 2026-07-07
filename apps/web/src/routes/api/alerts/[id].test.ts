import { describe, expect, it } from "bun:test";

import { DELETE, POST } from "./[id]";

describe("alert id routes", () => {
  it("returns a structured 400 when the alert id is missing for mark-read", async () => {
    const response = await POST({
      params: {},
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Missing alert id",
    });
  });

  it("returns a structured 400 when the alert id is missing for delete", async () => {
    const response = await DELETE({
      params: {},
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Missing alert id",
    });
  });
});
