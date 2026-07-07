import { describe, expect, it } from "bun:test";

import { createClearAlertsHandler } from "./alerts-clear-route";

describe("createClearAlertsHandler", () => {
  it("clears all alerts and returns 204", async () => {
    let cleared = false;

    const response = await createClearAlertsHandler({
      clearAlerts: async () => {
        cleared = true;
      },
    })();

    expect(cleared).toBe(true);
    expect(response.status).toBe(204);
  });
});
