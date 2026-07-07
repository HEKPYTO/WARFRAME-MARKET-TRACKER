import { describe, expect, it } from "bun:test";

import {
  normalizeItemSearchValue,
  searchCatalogItems,
  type ItemCatalogEntry,
} from "./item-search";

const catalog: ItemCatalogEntry[] = [
  {
    name: "Primed Continuity",
    slug: "primed_continuity",
    thumb: "primed_continuity.png",
  },
  {
    name: "Continuity",
    slug: "continuity",
    thumb: "continuity.png",
  },
  {
    name: "Arcane Blessing",
    slug: "arcane_blessing",
    thumb: "arcane_blessing.png",
  },
  {
    name: "Galvanized Chamber",
    slug: "galvanized_chamber",
    thumb: "galvanized_chamber.png",
  },
];

describe("normalizeItemSearchValue", () => {
  it("treats spaces, hyphens, and underscores as equivalent", () => {
    expect(normalizeItemSearchValue("Primed Continuity")).toBe(
      "primed continuity",
    );
    expect(normalizeItemSearchValue("primed-continuity")).toBe(
      "primed continuity",
    );
    expect(normalizeItemSearchValue("primed_continuity")).toBe(
      "primed continuity",
    );
  });
});

describe("searchCatalogItems", () => {
  it("matches partial readable names", () => {
    const result = searchCatalogItems(catalog, "primed cont");

    expect(result.map((item) => item.slug)).toEqual(["primed_continuity"]);
  });

  it("matches exact slugs", () => {
    const result = searchCatalogItems(catalog, "primed_continuity");

    expect(result.map((item) => item.slug)).toEqual(["primed_continuity"]);
  });

  it("ranks name prefixes ahead of later substrings", () => {
    const result = searchCatalogItems(catalog, "cont");

    expect(result.slice(0, 2).map((item) => item.slug)).toEqual([
      "continuity",
      "primed_continuity",
    ]);
  });

  it("limits the number of results", () => {
    const result = searchCatalogItems(catalog, "a", 2);

    expect(result).toHaveLength(2);
  });

  it("matches reordered query tokens against item names", () => {
    const result = searchCatalogItems(catalog, "continuity primed");

    expect(result.map((item) => item.slug)).toContain("primed_continuity");
    expect(result.at(0)?.slug).toBe("primed_continuity");
  });

  it("matches small typos without outranking exact results", () => {
    const result = searchCatalogItems(catalog, "primd continuty");

    expect(result.map((item) => item.slug)).toContain("primed_continuity");
    expect(result.at(0)?.slug).toBe("primed_continuity");
  });

  it("keeps exact token matches ahead of fuzzy multi-token candidates", () => {
    const result = searchCatalogItems(catalog, "continuity");

    expect(result.slice(0, 2).map((item) => item.slug)).toEqual([
      "continuity",
      "primed_continuity",
    ]);
  });

  it("matches reordered queries when one token is a near miss", () => {
    const result = searchCatalogItems(catalog, "continuity primd");

    expect(result.at(0)?.slug).toBe("primed_continuity");
  });

  it("does not return low-confidence fuzzy matches for unrelated input", () => {
    const result = searchCatalogItems(catalog, "zzzzzzzz");

    expect(result).toEqual([]);
  });

  it("matches token prefixes across reordered multi-word queries", () => {
    const result = searchCatalogItems(catalog, "cham galv");

    expect(result.at(0)?.slug).toBe("galvanized_chamber");
  });
});
