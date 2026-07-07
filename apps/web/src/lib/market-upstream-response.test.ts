import { describe, expect, it } from "bun:test";

import {
  MarketClientError,
  MarketClientNetworkError,
  MarketClientTimeoutError,
} from "@warframe-market-tracker/market-client";

import { createMarketUpstreamErrorResponse } from "./market-upstream-response";

describe("createMarketUpstreamErrorResponse", () => {
  it("maps timeouts into a structured 503 response", async () => {
    const response = createMarketUpstreamErrorResponse(
      new MarketClientTimeoutError(10_000),
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      error: "Market data timed out upstream. Try again shortly.",
    });
  });

  it("maps upstream rate limits into a structured 503 response", async () => {
    const response = createMarketUpstreamErrorResponse(
      new MarketClientError(429, "Too Many Requests"),
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      error:
        "Market data is temporarily rate limited upstream. Try again shortly.",
    });
  });

  it("maps other upstream failures into a structured 502 response", async () => {
    const response = createMarketUpstreamErrorResponse(
      new MarketClientError(503, "Service Unavailable"),
    );

    expect(response?.status).toBe(502);
    await expect(response?.json()).resolves.toEqual({
      error:
        "Market data is temporarily unavailable upstream. Try again shortly.",
    });
  });

  it("maps upstream network failures into a structured 502 response", async () => {
    const response = createMarketUpstreamErrorResponse(
      new MarketClientNetworkError(new TypeError("fetch failed"), "ECONNRESET"),
    );

    expect(response?.status).toBe(502);
    await expect(response?.json()).resolves.toEqual({
      error:
        "Market data is temporarily unavailable upstream. Try again shortly.",
    });
  });

  it("returns null for unexpected errors", () => {
    expect(createMarketUpstreamErrorResponse(new Error("boom"))).toBeNull();
  });
});
