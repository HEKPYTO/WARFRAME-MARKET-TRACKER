import { describe, expect, it } from "bun:test";

import { DELETE, PATCH } from "./[id]";

describe("watch rule id routes", () => {
  it("returns a structured 400 when the rule id is missing for patch", async () => {
    const response = await PATCH({
      params: {},
      request: new Request("http://localhost/api/watch-rules", {
        body: JSON.stringify({ enabled: true }),
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Missing rule id",
    });
  });

  it("returns a structured 400 when the rule id is missing for delete", async () => {
    const response = await DELETE({
      params: {},
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Missing rule id",
    });
  });
});
