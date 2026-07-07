import type { MarketOrder } from "@warframe-market-tracker/alert-engine";
import type { ItemCatalogEntry } from "@warframe-market-tracker/market-client";

import {
  estimateSupportedSetPartPrice,
  getSetPartCatalogEntries,
} from "./set-pricing";

export interface PrimeWarframeGraphInputRow {
  name: string;
  partEstimatedTotal: number;
  setPrice: number;
}

export interface PrimeWarframeGraphRow extends PrimeWarframeGraphInputRow {
  absoluteGap: number;
}

// Prime release order, oldest to newest. Kept local so reruns do not depend on
// live wiki scraping or news lookups.
const PRIME_WARFRAME_RELEASE_ORDER = [
  "Excalibur Prime",
  "Frost Prime",
  "Mag Prime",
  "Ember Prime",
  "Rhino Prime",
  "Loki Prime",
  "Nyx Prime",
  "Nova Prime",
  "Volt Prime",
  "Ash Prime",
  "Trinity Prime",
  "Saryn Prime",
  "Vauban Prime",
  "Nekros Prime",
  "Valkyr Prime",
  "Banshee Prime",
  "Oberon Prime",
  "Hydroid Prime",
  "Mirage Prime",
  "Zephyr Prime",
  "Limbo Prime",
  "Chroma Prime",
  "Mesa Prime",
  "Equinox Prime",
  "Wukong Prime",
  "Atlas Prime",
  "Ivara Prime",
  "Titania Prime",
  "Inaros Prime",
  "Nezha Prime",
  "Octavia Prime",
  "Gara Prime",
  "Nidus Prime",
  "Harrow Prime",
  "Garuda Prime",
  "Khora Prime",
  "Revenant Prime",
  "Baruuk Prime",
  "Hildryn Prime",
  "Wisp Prime",
  "Grendel Prime",
  "Gauss Prime",
  "Protea Prime",
  "Sevagoth Prime",
  "Xaku Prime",
  "Lavos Prime",
  "Yareli Prime",
  "Caliban Prime",
  "Gyre Prime",
  "Voruna Prime",
] as const;

const PRIME_WARFRAME_RELEASE_ORDER_INDEX: Map<string, number> = new Map(
  PRIME_WARFRAME_RELEASE_ORDER.map((name, index) => [name, index]),
);

const REQUIRED_WARFRAME_PART_SUFFIXES = [
  "Blueprint",
  "Chassis Blueprint",
  "Neuroptics Blueprint",
  "Systems Blueprint",
] as const;

function isPrimeSetName(name: string) {
  return /\sPrime Set$/i.test(name);
}

function getSetBaseName(name: string) {
  return name.replace(/\s+Set$/i, "").trim();
}

function hasRequiredWarframeParts(
  setEntry: ItemCatalogEntry,
  catalog: ItemCatalogEntry[],
) {
  const baseName = getSetBaseName(setEntry.name);
  const partNames = new Set(
    getSetPartCatalogEntries(setEntry.slug, catalog).map((entry) => entry.name),
  );

  return REQUIRED_WARFRAME_PART_SUFFIXES.every((suffix) =>
    partNames.has(`${baseName} ${suffix}`),
  );
}

export function listPrimeWarframeSetEntries(catalog: ItemCatalogEntry[]) {
  return catalog.filter(
    (entry) =>
      isPrimeSetName(entry.name) && hasRequiredWarframeParts(entry, catalog),
  );
}

export function getPrimeWarframeGraphPrice(orders: MarketOrder[]) {
  return estimateSupportedSetPartPrice(orders)?.estimatedPrice ?? null;
}

function getPrimeWarframeReleaseOrderIndex(name: string) {
  return (
    PRIME_WARFRAME_RELEASE_ORDER_INDEX.get(name) ?? Number.POSITIVE_INFINITY
  );
}

export function buildPrimeWarframeGraphRows<
  TRow extends PrimeWarframeGraphInputRow,
>(rows: TRow[]): Array<TRow & PrimeWarframeGraphRow> {
  return [...rows]
    .map((row) => ({
      ...row,
      absoluteGap: Math.abs(row.partEstimatedTotal - row.setPrice),
    }))
    .sort(
      (left, right) =>
        getPrimeWarframeReleaseOrderIndex(left.name) -
        getPrimeWarframeReleaseOrderIndex(right.name),
    );
}
