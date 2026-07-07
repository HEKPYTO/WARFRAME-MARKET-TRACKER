import { describe, expect, it, mock } from "bun:test";

import { createWatchRuleReorderHandler } from "./watch-rule-reorder-route";

describe("createWatchRuleReorderHandler", () => {
  it("rejects payloads that do not include every current rule id exactly once", async () => {
    const response = await createWatchRuleReorderHandler({
      listRuleIds: async () => ["rule-1", "rule-2"],
      reorderRuleIds: async () => undefined,
    })({
      request: new Request("http://localhost/api/watch-rules/reorder", {
        body: JSON.stringify({ ruleIds: ["rule-1"] }),
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "Submitted rule order must include every tracked rule exactly once",
    });
  });

  it("reorders rule ids when the payload matches the current tracked rules", async () => {
    const reorderRuleIds = mock(async (_ruleIds: string[]) => undefined);
    const response = await createWatchRuleReorderHandler({
      listRuleIds: async () => ["rule-1", "rule-2"],
      reorderRuleIds,
    })({
      request: new Request("http://localhost/api/watch-rules/reorder", {
        body: JSON.stringify({ ruleIds: ["rule-2", "rule-1"] }),
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      }),
    });

    expect(response.status).toBe(204);
    expect(reorderRuleIds).toHaveBeenCalledWith(["rule-2", "rule-1"]);
  });
});
