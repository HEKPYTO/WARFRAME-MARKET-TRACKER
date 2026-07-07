import { describe, expect, it } from "bun:test";

import {
  MarketClientError,
  MarketClientTimeoutError,
} from "@warframe-market-tracker/market-client";

import { createWorkspaceHandler } from "./workspace-route";

describe("createWorkspaceHandler", () => {
  it("returns a 400 response when the rule id is missing", async () => {
    const response = await createWorkspaceHandler({
      getWorkspaceSnapshot: async () => null,
    })({
      params: {},
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Missing rule id",
    });
  });

  it("returns a 404 response when the rule is missing", async () => {
    const response = await createWorkspaceHandler({
      getWorkspaceSnapshot: async () => null,
    })({
      params: {
        ruleId: "missing-rule",
      },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Rule not found",
    });
  });

  it("translates upstream rate limits into a structured 503 response", async () => {
    const response = await createWorkspaceHandler({
      getWorkspaceSnapshot: async () => {
        throw new MarketClientError(429, "Too Many Requests");
      },
    })({
      params: {
        ruleId: "rule-1",
      },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error:
        "Market data is temporarily rate limited upstream. Try again shortly.",
    });
  });

  it("translates upstream timeouts into a structured 503 response", async () => {
    const response = await createWorkspaceHandler({
      getWorkspaceSnapshot: async () => {
        throw new MarketClientTimeoutError(10_000);
      },
    })({
      params: {
        ruleId: "rule-1",
      },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Market data timed out upstream. Try again shortly.",
    });
  });

  it("translates other upstream market failures into a structured 502 response", async () => {
    const response = await createWorkspaceHandler({
      getWorkspaceSnapshot: async () => {
        throw new MarketClientError(503, "Service Unavailable");
      },
    })({
      params: {
        ruleId: "rule-1",
      },
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error:
        "Market data is temporarily unavailable upstream. Try again shortly.",
    });
  });

  it("returns the workspace snapshot when upstream succeeds", async () => {
    const response = await createWorkspaceHandler({
      getWorkspaceSnapshot: async () => ({
        marketTop: [],
        offlineOrders: [],
        onlineOrders: [],
        rule: {
          createdAt: "2026-03-25T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-1",
          itemSlug: "arcane_barrier",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 1,
          updatedAt: "2026-03-25T00:00:00.000Z",
          userId: "local-demo-user",
        },
        setPricing: null,
      }),
    })({
      params: {
        ruleId: "rule-1",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      marketTop: [],
      offlineOrders: [],
      onlineOrders: [],
      rule: expect.objectContaining({
        id: "rule-1",
      }),
      setPricing: null,
    });
  });
});
