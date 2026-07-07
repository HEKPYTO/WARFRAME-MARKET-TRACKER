// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";
import { getRequestEvent } from "solid-js/web";
import { getDashboardBootstrapScript } from "~/lib/dashboard-bootstrap";
import {
  getThemeBootstrapScript,
  parseThemeModeFromCookieHeader,
  resolveDocumentTheme,
} from "~/lib/theme";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => {
      const requestEvent = getRequestEvent();
      const themeMode =
        parseThemeModeFromCookieHeader(
          requestEvent?.request.headers.get("cookie"),
        ) ?? "system";
      const documentTheme = resolveDocumentTheme(themeMode, false);
      const dashboardBootstrapScript = getDashboardBootstrapScript();
      const themeBootstrapScript = getThemeBootstrapScript();

      return (
        <html data-theme={documentTheme} data-theme-mode={themeMode} lang="en">
          <head>
            <meta charset="utf-8" />
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />
            <link rel="icon" href="/favicon.ico" />
            <style>{`html[data-dashboard-bootstrapping="true"] #app { visibility: hidden; }`}</style>
            {/* Inline bootstrap keeps cached dashboard content from flashing to the empty SSR shell before hydration. */}
            {/* eslint-disable-next-line solid/no-innerhtml */}
            <script innerHTML={dashboardBootstrapScript} />
            {/* Inline bootstrap prevents a first-paint theme mismatch before hydration. */}
            {/* eslint-disable-next-line solid/no-innerhtml */}
            <script innerHTML={themeBootstrapScript} />
            {assets}
          </head>
          <body>
            <div id="app">{children}</div>
            {scripts}
          </body>
        </html>
      );
    }}
  />
));
