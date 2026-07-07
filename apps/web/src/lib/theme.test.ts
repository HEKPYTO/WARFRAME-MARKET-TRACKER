import { describe, expect, it } from "bun:test";

import {
  getThemeBootstrapScript,
  parseThemeModeFromCookieHeader,
  resolveDocumentTheme,
  serializeThemeCookie,
} from "./theme";

describe("parseThemeModeFromCookieHeader", () => {
  it("returns the theme mode when present in cookies", () => {
    expect(
      parseThemeModeFromCookieHeader("foo=bar; wmt-theme=dark; baz=1"),
    ).toBe("dark");
  });

  it("ignores invalid theme cookie values", () => {
    expect(parseThemeModeFromCookieHeader("wmt-theme=sepia")).toBeUndefined();
  });
});

describe("resolveDocumentTheme", () => {
  it("resolves system mode from the preferred color scheme", () => {
    expect(resolveDocumentTheme("system", true)).toBe("dark");
    expect(resolveDocumentTheme("system", false)).toBe("light");
  });

  it("keeps explicit light and dark modes stable", () => {
    expect(resolveDocumentTheme("light", true)).toBe("light");
    expect(resolveDocumentTheme("dark", false)).toBe("dark");
  });
});

describe("serializeThemeCookie", () => {
  it("builds a persistent first-party theme cookie", () => {
    expect(serializeThemeCookie("dark", false)).toBe(
      "wmt-theme=dark; Max-Age=31536000; Path=/; SameSite=Lax",
    );
  });

  it("adds Secure when requested", () => {
    expect(serializeThemeCookie("light", true)).toContain("Secure");
  });
});

describe("getThemeBootstrapScript", () => {
  it("includes the theme cookie name in the pre-hydration script", () => {
    expect(getThemeBootstrapScript()).toContain("wmt-theme");
  });
});
