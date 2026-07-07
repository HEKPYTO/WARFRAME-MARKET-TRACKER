import { describe, expect, it } from "bun:test";

import {
  getRuleDisplayLabel,
  persistRuleLabelCache,
  readRuleLabelCache,
} from "./rule-labels";

function createMemoryStorage() {
  const entries = new Map<string, string>();

  return {
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
  };
}

describe("getRuleDisplayLabel", () => {
  it("returns the cached item name when present", () => {
    expect(
      getRuleDisplayLabel("primed_flow", {
        primed_flow: "Primed Flow",
      }),
    ).toBe("Primed Flow");
  });

  it("falls back to a title-cased slug when no cached label exists", () => {
    expect(getRuleDisplayLabel("primed_flow", {})).toBe("Primed Flow");
  });
});

describe("rule label cache", () => {
  it("round-trips resolved labels through session storage", () => {
    const storage = createMemoryStorage();

    persistRuleLabelCache(storage, {
      primed_flow: "Primed Flow",
      saryn_prime_set: "Saryn Prime Set",
    });

    expect(readRuleLabelCache(storage)).toEqual({
      primed_flow: "Primed Flow",
      saryn_prime_set: "Saryn Prime Set",
    });
  });

  it("drops malformed cached values", () => {
    const storage = createMemoryStorage();
    storage.setItem("wmt-rule-label-cache:v1", '{"primed_flow":123}');

    expect(readRuleLabelCache(storage)).toEqual({});
    expect(storage.getItem("wmt-rule-label-cache:v1")).toBeNull();
  });
});
