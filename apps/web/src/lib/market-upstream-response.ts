import {
  MarketClientError,
  MarketClientNetworkError,
  MarketClientTimeoutError,
} from "@warframe-market-tracker/market-client";

export function createMarketUpstreamErrorResponse(error: unknown) {
  if (error instanceof MarketClientTimeoutError) {
    return Response.json(
      {
        error: "Market data timed out upstream. Try again shortly.",
      },
      { status: 503 },
    );
  }

  if (error instanceof MarketClientError && error.status === 429) {
    return Response.json(
      {
        error:
          "Market data is temporarily rate limited upstream. Try again shortly.",
      },
      { status: 503 },
    );
  }

  if (error instanceof MarketClientError) {
    return Response.json(
      {
        error:
          "Market data is temporarily unavailable upstream. Try again shortly.",
      },
      { status: 502 },
    );
  }

  if (error instanceof MarketClientNetworkError) {
    return Response.json(
      {
        error:
          "Market data is temporarily unavailable upstream. Try again shortly.",
      },
      { status: 502 },
    );
  }

  return null;
}
