import {
  getRuntimeConfig,
  MarketClient,
} from "@warframe-market-tracker/market-client";

export function createWebMarketClient(
  env: Partial<Record<string, string | undefined>> = process.env,
) {
  const runtimeConfig = getRuntimeConfig(env);

  return new MarketClient({
    baseUrl: runtimeConfig.marketBaseUrl,
    crossplay: runtimeConfig.marketCrossplay,
    language: runtimeConfig.marketLanguage,
    platform: runtimeConfig.marketPlatform,
  });
}
