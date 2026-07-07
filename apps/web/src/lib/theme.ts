export type ThemeMode = "system" | "light" | "dark";
export type DocumentTheme = "light" | "dark";

export const THEME_COOKIE_NAME = "wmt-theme";
const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function isThemeMode(
  value: string | null | undefined,
): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export function parseThemeModeFromCookieHeader(
  cookieHeader: string | null | undefined,
): ThemeMode | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const cookieSegment of cookieHeader.split(";")) {
    const [rawName, ...valueParts] = cookieSegment.trim().split("=");
    if (rawName !== THEME_COOKIE_NAME) {
      continue;
    }

    const decodedValue = decodeURIComponent(valueParts.join("="));
    if (isThemeMode(decodedValue)) {
      return decodedValue;
    }
  }

  return undefined;
}

export function resolveDocumentTheme(
  themeMode: ThemeMode,
  prefersDark: boolean,
): DocumentTheme {
  if (themeMode === "dark") {
    return "dark";
  }

  if (themeMode === "light") {
    return "light";
  }

  return prefersDark ? "dark" : "light";
}

export function getPreferredDarkMode() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

export function applyThemeToDocument(
  themeMode: ThemeMode,
  documentElement = document.documentElement,
) {
  const resolvedTheme = resolveDocumentTheme(themeMode, getPreferredDarkMode());
  documentElement.setAttribute("data-theme", resolvedTheme);
  documentElement.setAttribute("data-theme-mode", themeMode);
  return resolvedTheme;
}

export function readThemeModeFromDocument(
  documentElement = document.documentElement,
) {
  const storedThemeMode = documentElement.getAttribute("data-theme-mode");
  return isThemeMode(storedThemeMode) ? storedThemeMode : "system";
}

export function serializeThemeCookie(themeMode: ThemeMode, secure: boolean) {
  const attributes = [
    `${THEME_COOKIE_NAME}=${encodeURIComponent(themeMode)}`,
    `Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
  ];

  if (secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function persistThemeCookie(themeMode: ThemeMode) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  document.cookie = serializeThemeCookie(
    themeMode,
    window.location.protocol === "https:",
  );
}

export function getThemeBootstrapScript() {
  return `(() => {
    const cookieName = "${THEME_COOKIE_NAME}=";
    const cookieTheme = document.cookie
      .split("; ")
      .find((segment) => segment.startsWith(cookieName))
      ?.slice(cookieName.length);
    const themeMode =
      cookieTheme === "light" || cookieTheme === "dark" || cookieTheme === "system"
        ? cookieTheme
        : "system";
    const resolvedTheme =
      themeMode === "dark" ||
      (themeMode === "system" &&
        window.matchMedia("${DARK_MEDIA_QUERY}").matches)
        ? "dark"
        : "light";
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    document.documentElement.setAttribute("data-theme-mode", themeMode);
  })();`;
}
