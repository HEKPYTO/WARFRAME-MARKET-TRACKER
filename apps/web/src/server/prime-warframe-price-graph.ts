import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { MarketOrder } from "@warframe-market-tracker/alert-engine";

import { getRuntimeConfig } from "@warframe-market-tracker/market-client";
import { MarketClientError } from "@warframe-market-tracker/market-client";

import { createWebMarketClient } from "./market-client";
import {
  buildPrimeWarframeGraphRows,
  getPrimeWarframeGraphPrice,
  listPrimeWarframeSetEntries,
} from "./prime-warframe-price-graph-lib";
import { getSetPartCatalogEntries } from "./set-pricing";

interface PrimeWarframePriceGraphDataset {
  generatedAt: string;
  rows: Array<{
    absoluteGap: number;
    name: string;
    partEstimatedTotal: number;
    setPrice: number;
    slug: string;
  }>;
}

const GRAPH_REQUEST_SPACING_MULTIPLIER = 4;
const GRAPH_REQUEST_MAX_RETRIES = 5;
const GRAPH_REQUEST_BACKOFF_MS = 30_000;

function sleep(ms: number) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function createRateLimitedOrderLoader(input: {
  listItemOrders: (itemSlug: string) => Promise<MarketOrder[]>;
  spacingMs: number;
}) {
  let queue = Promise.resolve();

  return async (itemSlug: string) => {
    const run = queue.then(async () => {
      let orders: MarketOrder[] | undefined;

      for (
        let attempt = 0;
        attempt <= GRAPH_REQUEST_MAX_RETRIES;
        attempt += 1
      ) {
        try {
          orders = await input.listItemOrders(itemSlug);
          break;
        } catch (error) {
          const isRetriableRateLimit =
            error instanceof MarketClientError &&
            error.status === 429 &&
            attempt < GRAPH_REQUEST_MAX_RETRIES;

          if (!isRetriableRateLimit) {
            throw error;
          }

          const backoffMs = GRAPH_REQUEST_BACKOFF_MS * (attempt + 1);
          console.log(
            `  rate limited on ${itemSlug}, retrying in ${Math.round(backoffMs / 1000)}s`,
          );
          await sleep(backoffMs);
        }
      }

      if (!orders) {
        throw new Error(`Failed to load market orders for ${itemSlug}`);
      }

      await sleep(input.spacingMs);
      return orders;
    });

    queue = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  };
}

const client = createWebMarketClient();

async function main() {
  const runtimeConfig = getRuntimeConfig(process.env);
  const orderLoader = createRateLimitedOrderLoader({
    listItemOrders: (itemSlug) => client.getItemOrders(itemSlug),
    spacingMs:
      runtimeConfig.safeRequestSpacingMs * GRAPH_REQUEST_SPACING_MULTIPLIER,
  });

  const catalog = await client.listItems();
  const setEntries = listPrimeWarframeSetEntries(catalog).sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  console.log(`Found ${setEntries.length} prime warframe sets.`);

  const rows: PrimeWarframePriceGraphDataset["rows"] = [];

  for (const [index, setEntry] of setEntries.entries()) {
    console.log(`[${index + 1}/${setEntries.length}] ${setEntry.name}`);

    const setOrders = await orderLoader(setEntry.slug);
    const setPrice = getPrimeWarframeGraphPrice(setOrders);
    const partEntries = getSetPartCatalogEntries(setEntry.slug, catalog);
    const partPrices = await Promise.all(
      partEntries.map(async (partEntry) =>
        getPrimeWarframeGraphPrice(await orderLoader(partEntry.slug)),
      ),
    );

    if (setPrice === null || partPrices.some((price) => price === null)) {
      console.log(`  skipping incomplete data`);
      continue;
    }

    const completedPartPrices = partPrices.filter(
      (price): price is number => price !== null,
    );
    const partEstimatedTotal = completedPartPrices.reduce(
      (total, price) => total + price,
      0,
    );

    const graphRow = buildPrimeWarframeGraphRows([
      {
        name: setEntry.name.replace(/\s+Set$/i, ""),
        partEstimatedTotal,
        setPrice,
      },
    ])[0];

    if (!graphRow) {
      continue;
    }

    rows.push({
      absoluteGap: graphRow.absoluteGap,
      name: graphRow.name,
      partEstimatedTotal: graphRow.partEstimatedTotal,
      setPrice: graphRow.setPrice,
      slug: setEntry.slug,
    });
  }

  const dataset: PrimeWarframePriceGraphDataset = {
    generatedAt: new Date().toISOString(),
    rows: buildPrimeWarframeGraphRows(rows),
  };

  const outputPath = resolve(
    import.meta.dir,
    "../../../../artifacts/prime-warframe-price-graph.json",
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");

  console.log(`Wrote ${dataset.rows.length} rows to ${outputPath}`);
}

await main();
