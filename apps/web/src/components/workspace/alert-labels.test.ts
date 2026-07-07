import { describe, expect, it } from "bun:test";

import { getAlertDisplayLabel } from "./alert-labels";

describe("getAlertDisplayLabel", () => {
  it("formats raw alert slugs into a human-readable item name", () => {
    expect(getAlertDisplayLabel("titania_prime_chassis_blueprint", {})).toBe(
      "Titania Prime Chassis Blueprint",
    );
  });

  it("prefers a resolved cached item label when one exists", () => {
    expect(
      getAlertDisplayLabel("primed_flow", {
        primed_flow: "Primed Flow",
      }),
    ).toBe("Primed Flow");
  });
});
