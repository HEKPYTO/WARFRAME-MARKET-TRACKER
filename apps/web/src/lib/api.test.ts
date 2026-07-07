import { afterEach, describe, expect, it } from "bun:test";

import {
  clearAlerts,
  createRule,
  deleteAlert,
  deleteRule,
  fetchDashboard,
  reorderRules,
  resolveRequestInput,
  searchItems,
  sendDiscordSettingsTest,
  updateRule,
} from "./api";

describe("resolveRequestInput", () => {
  it("builds an absolute internal URL for server-side relative API calls", () => {
    const result = resolveRequestInput("/api/dashboard", {
      internalOrigin: "http://tracker.internal:4000",
      isServer: true,
    });

    expect(result).toBeInstanceOf(URL);
    expect(result.toString()).toBe(
      "http://tracker.internal:4000/api/dashboard",
    );
  });

  it("falls back to localhost when no internal origin is provided", () => {
    const result = resolveRequestInput("/api/watch-rules", {
      isServer: true,
      port: "7777",
    });

    expect(result).toBeInstanceOf(URL);
    expect(result.toString()).toBe("http://localhost:7777/api/watch-rules");
  });

  it("keeps browser-side relative paths untouched", () => {
    expect(resolveRequestInput("/api/dashboard", { isServer: false })).toBe(
      "/api/dashboard",
    );
  });
});

describe("createRule", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("surfaces structured API errors from the backend", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "Unknown item slug" }), {
        status: 422,
        headers: {
          "content-type": "application/json",
        },
      })) as unknown as typeof fetch;

    await expect(
      createRule({
        itemSlug: "definitely_fake_slug",
        maxPlatinum: 10,
      }),
    ).rejects.toThrow("Unknown item slug");
  });

  it("falls back to the HTTP status message when the JSON error body is malformed", async () => {
    globalThis.fetch = (async () =>
      new Response("not-json", {
        status: 503,
        headers: {
          "content-type": "application/json",
        },
      })) as unknown as typeof fetch;

    await expect(
      createRule({
        itemSlug: "definitely_fake_slug",
        maxPlatinum: 10,
      }),
    ).rejects.toThrow("Request failed: 503 Service Unavailable");
  });

  it("omits maxPlatinum from the payload when the threshold is left blank", async () => {
    let requestInit: RequestInit | undefined;

    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      requestInit = init;
      return new Response(
        JSON.stringify({
          createdAt: "2026-03-23T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-1",
          itemSlug: "arcane_barrier",
          maxPlatinum: 12,
          platform: "pc",
          sortOrder: 1,
          updatedAt: "2026-03-23T00:00:00.000Z",
          userId: "local-demo-user",
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 201,
        },
      );
    }) as unknown as typeof fetch;

    await createRule({
      itemSlug: "arcane_barrier",
    });

    expect(requestInit?.body).toBe(
      JSON.stringify({ itemSlug: "arcane_barrier" }),
    );
  });
});

describe("sendDiscordSettingsTest", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts the current Discord draft state to the settings test route", async () => {
    let requestInput: RequestInfo | URL | undefined;
    let requestInit: RequestInit | undefined;

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      requestInput = input;
      requestInit = init;
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    await sendDiscordSettingsTest({
      discordBotToken: "bot-token",
      discordChannelId: "channel-id",
      discordEnabled: true,
    });

    expect(String(requestInput)).toContain("/api/settings-test");
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.body).toBe(
      JSON.stringify({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
      }),
    );
  });
});

describe("deleteRule", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("surfaces structured API errors from the backend", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "Unknown rule id" }), {
        status: 404,
        headers: {
          "content-type": "application/json",
        },
      })) as unknown as typeof fetch;

    await expect(deleteRule("missing-rule")).rejects.toThrow("Unknown rule id");
  });
});

describe("updateRule", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends a patch payload for threshold updates", async () => {
    let requestInit: RequestInit | undefined;

    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      requestInit = init;
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    await updateRule("rule-1", { maxPlatinum: 42 });

    expect(requestInit?.method).toBe("PATCH");
    expect(requestInit?.body).toBe(JSON.stringify({ maxPlatinum: 42 }));
  });
});

describe("reorderRules", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts an ordered rule id list to the reorder endpoint", async () => {
    let requestInput: RequestInfo | URL | undefined;
    let requestInit: RequestInit | undefined;

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      requestInput = input;
      requestInit = init;
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    await reorderRules(["rule-2", "rule-1"]);

    expect(String(requestInput)).toContain("/api/watch-rules/reorder");
    expect(requestInit?.method).toBe("PATCH");
    expect(requestInit?.body).toBe(
      JSON.stringify({ ruleIds: ["rule-2", "rule-1"] }),
    );
  });
});

describe("deleteAlert", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("surfaces structured API errors from the backend", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "Unknown alert id" }), {
        status: 404,
        headers: {
          "content-type": "application/json",
        },
      })) as unknown as typeof fetch;

    await expect(deleteAlert("missing-alert")).rejects.toThrow(
      "Unknown alert id",
    );
  });
});

describe("clearAlerts", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends a delete request to the alerts collection endpoint", async () => {
    let requestInput: RequestInfo | URL | undefined;
    let requestInit: RequestInit | undefined;

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      requestInput = input;
      requestInit = init;
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    await clearAlerts();

    expect(String(requestInput)).toContain("/api/alerts");
    expect(requestInit?.method).toBe("DELETE");
  });
});

describe("fetchDashboard", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the dashboard meta worker health contract", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          alerts: [],
          meta: {
            marketCrossplay: true,
            marketPlatform: "pc",
            safeRequestSpacingMs: 500,
            safeRequestsPerSecond: 2,
            trackingPaused: false,
            theoreticalRequestsPerSecond: 3,
            workerHealth: {
              consecutiveFailures: 1,
              expectedCycleIntervalMs: null,
              lastActivityAt: null,
              lastCycleStartedAt: null,
              lastErrorMessage:
                "Worker health unavailable from worker endpoint",
              lastSuccessfulCycleAt: null,
              observedCycleIntervalMs: null,
              trackingPaused: false,
            },
            workerHealthState: "unhealthy",
          },
          rules: [],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      )) as unknown as typeof fetch;

    const result = await fetchDashboard();

    expect(result.meta.workerHealth).toEqual({
      consecutiveFailures: 1,
      expectedCycleIntervalMs: null,
      lastActivityAt: null,
      lastCycleStartedAt: null,
      lastErrorMessage: "Worker health unavailable from worker endpoint",
      lastSuccessfulCycleAt: null,
      observedCycleIntervalMs: null,
      trackingPaused: false,
    });
    expect(result.meta.workerHealthState).toBe("unhealthy");
  });

  it("defaults missing worker health state to unknown", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          alerts: [],
          meta: {
            marketCrossplay: true,
            marketPlatform: "pc",
            safeRequestSpacingMs: 500,
            safeRequestsPerSecond: 2,
            trackingPaused: false,
            theoreticalRequestsPerSecond: 3,
            workerHealth: {
              consecutiveFailures: 0,
              expectedCycleIntervalMs: 5_000,
              lastActivityAt: "2026-03-30T00:00:10.000Z",
              lastCycleStartedAt: "2026-03-30T00:00:00.000Z",
              lastErrorMessage: null,
              lastSuccessfulCycleAt: "2026-03-30T00:00:10.000Z",
              observedCycleIntervalMs: 5_000,
              trackingPaused: false,
            },
          },
          rules: [],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      )) as unknown as typeof fetch;

    const result = await fetchDashboard();

    expect(result.meta.workerHealthState).toBe("unknown");
  });

  it("derives an unhealthy state when worker failures are present but the state is missing", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          alerts: [],
          meta: {
            marketCrossplay: true,
            marketPlatform: "pc",
            safeRequestSpacingMs: 500,
            safeRequestsPerSecond: 2,
            trackingPaused: false,
            theoreticalRequestsPerSecond: 3,
            workerHealth: {
              consecutiveFailures: 1,
              expectedCycleIntervalMs: null,
              lastActivityAt: null,
              lastCycleStartedAt: null,
              lastErrorMessage:
                "Worker health unavailable from worker endpoint",
              lastSuccessfulCycleAt: null,
              observedCycleIntervalMs: null,
              trackingPaused: false,
            },
          },
          rules: [],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      )) as unknown as typeof fetch;

    const result = await fetchDashboard();

    expect(result.meta.workerHealthState).toBe("unhealthy");
  });
});

describe("searchItems", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("queries the item-search endpoint with the trimmed query and optional limit", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      requests.push(
        init === undefined
          ? { input }
          : {
              init,
              input,
            },
      );

      return new Response(
        JSON.stringify({
          items: [
            {
              name: "Primed Continuity",
              slug: "primed_continuity",
              thumb: "primed_continuity.png",
            },
          ],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    }) as unknown as typeof fetch;

    await expect(searchItems("  primed  ", 5)).resolves.toEqual([
      {
        name: "Primed Continuity",
        slug: "primed_continuity",
        thumb: "primed_continuity.png",
      },
    ]);

    expect(String(requests[0]?.input)).toContain(
      "/api/item-search?q=primed&limit=5",
    );
  });
});
