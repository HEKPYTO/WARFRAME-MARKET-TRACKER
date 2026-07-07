const DEFAULT_MARKET_BASE_URL = "https://api.warframe.market/v2";
const DEFAULT_MARKET_LANGUAGE = "en";
const DEFAULT_MARKET_PLATFORM = "pc";
const MAX_CONCURRENT_MARKET_REQUESTS = 2;
const DEFAULT_ADAPTIVE_CONCURRENCY_MODE = "adaptive";
const THEORETICAL_REQUESTS_PER_SECOND = 3;
const SAFE_REQUESTS_PER_SECOND = 2;

const ADAPTIVE_CONCURRENCY_MODES = ["baseline", "adaptive"] as const;

type AdaptiveConcurrencyMode = (typeof ADAPTIVE_CONCURRENCY_MODES)[number];

export interface RuntimeConfig {
  adaptiveConcurrencyMode: AdaptiveConcurrencyMode;
  marketBaseUrl: string;
  maxConcurrentMarketRequests: number;
  marketCrossplay: boolean;
  marketLanguage: string;
  marketPlatform: string;
  safeRequestSpacingMs: number;
  safeRequestsPerSecond: number;
  theoreticalRequestsPerSecond: number;
}

function parseRuntimeMode<TMode extends string>(
  value: string | undefined,
  modes: readonly TMode[],
  defaultMode: TMode,
): TMode {
  return modes.includes(value as TMode) ? (value as TMode) : defaultMode;
}

export function getTrackedItemPollingIntervalMs(input: {
  safeRequestSpacingMs: number;
  trackedItems: number;
}) {
  if (input.trackedItems <= 0) {
    return null;
  }

  return Math.max(
    input.safeRequestSpacingMs,
    input.trackedItems * input.safeRequestSpacingMs,
  );
}

export function getRuntimeConfig(
  env: Partial<Record<string, string | undefined>>,
): RuntimeConfig {
  const safeRequestSpacingMs = Math.ceil(1000 / SAFE_REQUESTS_PER_SECOND);

  return {
    adaptiveConcurrencyMode: parseRuntimeMode(
      env.WORKER_ADAPTIVE_CONCURRENCY_MODE,
      ADAPTIVE_CONCURRENCY_MODES,
      DEFAULT_ADAPTIVE_CONCURRENCY_MODE,
    ),
    marketBaseUrl: env.MARKET_API_BASE_URL ?? DEFAULT_MARKET_BASE_URL,
    maxConcurrentMarketRequests: MAX_CONCURRENT_MARKET_REQUESTS,
    marketCrossplay: (env.MARKET_CROSSPLAY ?? "true") === "true",
    marketLanguage: env.MARKET_LANGUAGE ?? DEFAULT_MARKET_LANGUAGE,
    marketPlatform: env.MARKET_PLATFORM ?? DEFAULT_MARKET_PLATFORM,
    safeRequestSpacingMs,
    safeRequestsPerSecond: SAFE_REQUESTS_PER_SECOND,
    theoreticalRequestsPerSecond: THEORETICAL_REQUESTS_PER_SECOND,
  };
}
