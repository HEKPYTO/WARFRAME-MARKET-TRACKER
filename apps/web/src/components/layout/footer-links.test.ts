import { describe, expect, it } from "bun:test";

import { getRulesFooterLinkPresentation } from "./footer-links";

describe("getRulesFooterLinkPresentation", () => {
  it("turns the rules count into an exit link on the settings page", () => {
    expect(getRulesFooterLinkPresentation("/settings", 9)).toEqual({
      ariaLabel: "Close settings via rules list",
      href: "/",
      label: "9 rules",
      title: "Return to tracked rules",
    });
  });

  it("keeps the rules count passive on non-settings routes", () => {
    expect(getRulesFooterLinkPresentation("/", 9)).toEqual({
      ariaLabel: undefined,
      href: undefined,
      label: "9 rules",
      title: undefined,
    });
  });
});
