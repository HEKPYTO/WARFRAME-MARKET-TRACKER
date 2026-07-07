import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { searchCatalogItems } from "../src/lib/item-search";

const ITEM_SEARCH_FIXTURES = [
  {
    name: "Arcane Barrier",
    slug: "arcane_barrier",
    thumb: "arcane_barrier.png",
  },
  {
    name: "Primed Continuity",
    slug: "primed_continuity",
    thumb: "primed_continuity.png",
  },
  {
    name: "Primed Chamber",
    slug: "primed_chamber",
    thumb: "primed_chamber.png",
  },
  {
    name: "Primed Flow",
    slug: "primed_flow",
    thumb: "primed_flow.png",
  },
  {
    name: "Wisp Prime Set",
    slug: "wisp_prime_set",
    thumb: "wisp_prime_set.png",
  },
];

const RAPID_POLL_ITEM_SLUGS = [
  "arcane_barrier",
  "primed_continuity",
  "primed_chamber",
  "primed_flow",
  "wisp_prime_set",
  "arcane_energize",
  "saryn_prime_set",
];

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function createWorkspaceSellOrder(input: {
  id: string;
  ingameName: string;
  lastSeen?: string;
  platinum: number;
  status: "offline" | "online" | "ingame";
}) {
  return {
    id: input.id,
    itemId: "item-1",
    platinum: input.platinum,
    quantity: 1,
    rank: 0,
    type: "sell" as const,
    updatedAt: "2026-03-21T00:00:00.000Z",
    user: {
      id: `user-${input.id}`,
      ingameName: input.ingameName,
      lastSeen: input.lastSeen ?? "2026-03-21T00:00:00.000Z",
      slug: input.ingameName.toLowerCase(),
      status: input.status,
    },
    visible: true,
  };
}

function createWorkerHealthRule() {
  return {
    createdAt: "2026-03-30T00:00:00.000Z",
    crossplay: true,
    enabled: true,
    id: "rule-health-1",
    itemSlug: "arcane_barrier",
    maxPlatinum: 10,
    platform: "pc",
    sortOrder: 1,
    updatedAt: "2026-03-30T00:00:00.000Z",
    userId: "local-demo-user",
  };
}

function createWorkerHealthMeta(input: {
  trackingPaused: boolean;
  workerHealth: {
    consecutiveFailures: number;
    lastCycleStartedAt: string | null;
    lastErrorMessage: string | null;
    lastSuccessfulCycleAt: string | null;
    trackingPaused: boolean;
  };
}) {
  return {
    marketCrossplay: true,
    marketPlatform: "pc",
    safeRequestSpacingMs: 500,
    safeRequestsPerSecond: 2,
    theoreticalRequestsPerSecond: 2,
    trackingPaused: input.trackingPaused,
    workerHealth: input.workerHealth,
  };
}

async function saveEnabledDiscordSettings(request: APIRequestContext) {
  const response = await request.put("/api/settings", {
    data: {
      discordBotToken: "",
      discordChannelId: "123456789012345678",
      discordEnabled: true,
      trackingPaused: false,
    },
  });

  await expect(response).toBeOK();
}

async function selectItemByKeyboard(page: Page, query: string) {
  const input = page.locator('input[name="itemSlug"]');

  await input.fill(query);
  await expect(page.getByTestId("item-search-option-0")).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(page.getByTestId("item-search-listbox")).toBeHidden();
}

test.describe("Warframe Market Tracker Dashboard", () => {
  test("renders the stored theme cookie on the server to prevent flash", async ({
    request,
  }) => {
    const response = await request.get("/", {
      headers: {
        cookie: "wmt-theme=dark",
      },
    });

    await expect(response).toBeOK();

    const html = await response.text();

    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('data-theme-mode="dark"');
  });

  test.beforeEach(async ({ request, page }) => {
    const response = await request.post("/api/dev/reset", {
      data: { seed: "empty" },
    });

    await expect(response).toBeOK();

    await page.route("**/api/item-search**", async (route) => {
      const url = new URL(route.request().url());
      const query = normalizeSearchValue(url.searchParams.get("q") ?? "");
      const limit = Number.parseInt(url.searchParams.get("limit") ?? "8", 10);

      if (query.length < 2) {
        await route.fulfill({
          body: JSON.stringify({
            error: "Search query must be at least 2 characters",
          }),
          contentType: "application/json",
          status: 400,
        });
        return;
      }

      const items = searchCatalogItems(
        ITEM_SEARCH_FIXTURES,
        query,
        Number.isNaN(limit) ? 8 : limit,
      );

      await route.fulfill({
        body: JSON.stringify({ items }),
        contentType: "application/json",
        status: 200,
      });
    });
  });

  test("loads the main layout and essential panes", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("Warframe Market Tracker");
    await expect(page.getByTestId("dashboard-shell")).toBeVisible();
    await expect(page.getByTestId("watchlist-panel")).toBeVisible();
    await expect(page.getByTestId("market-panel")).toBeVisible();
    await expect(page.getByTestId("alerts-panel")).toBeVisible();
    await expect(page.locator('input[name="itemSlug"]')).toHaveAttribute(
      "placeholder",
      "Search Item",
    );
    await expect(page.locator('input[name="maxPlatinum"]')).toHaveAttribute(
      "placeholder",
      "Price",
    );
    await expect(page.getByText("warframe-market-tracker")).toBeVisible();
    await expect(page.getByText("outline")).toBeVisible();
    await expect(page.getByTestId("market-header")).toBeVisible();
    await expect(page.getByTestId("market-header")).not.toContainText("src");
    await expect(page.getByTestId("market-header")).not.toContainText("market");
    await expect(page.getByTestId("market-header")).not.toContainText("/");
    await expect(page.getByTestId("market-header")).not.toContainText(
      "standby",
    );
    await expect(page.getByRole("heading", { name: "Watchlist" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("heading", { name: "Alert Feed" })).toHaveCount(
      0,
    );

    const statusBar = page.locator("footer");
    await expect(statusBar).toBeVisible();
    await expect(statusBar).not.toContainText("crossplay");
    await expect(statusBar).not.toContainText("solo");
    await expect(statusBar).toContainText("0 alerts");
    await expect(page.getByTestId("rules-footer-token")).toContainText(
      "0 rules",
    );
    await expect(page.getByTestId("settings-link")).toBeVisible();
    await expect(page.getByTestId("theme-toggle")).toBeVisible();
    await expect(page.getByTestId("settings-tooltip")).toBeHidden();
    await expect(page.getByTestId("theme-toggle-tooltip")).toBeHidden();
    await expect(page.getByTestId("polling-tooltip")).toBeHidden();
    await expect(page.getByTestId("polling-indicator")).toHaveAttribute(
      "aria-label",
      /waiting for tracked items/,
    );
    await expect(page.getByTestId("polling-indicator")).not.toHaveAttribute(
      "aria-label",
      /live:/,
    );
    await expect(page.getByTestId("polling-indicator")).toHaveAttribute(
      "aria-describedby",
      "polling-tooltip",
    );

    const visibleFooterText = await statusBar.evaluate(
      (element) => (element as HTMLElement).innerText,
    );
    expect(visibleFooterText).not.toContain("interval");

    await expect(page.locator("text=No active watch rules")).toBeVisible();
    await expect(page.locator("text=No watch rules yet")).toBeVisible();
  });

  test("footer keeps the compact legacy layout while hiding platform context", async ({
    page,
    request,
  }) => {
    const response = await request.post("/api/dev/reset", {
      data: { seed: "demo" },
    });

    await expect(response).toBeOK();

    await page.goto("/");

    const statusBar = page.locator("footer");
    await expect(statusBar).not.toContainText("crossplay");
    await expect(statusBar).not.toContainText("solo");
    await expect(page.getByTestId("polling-indicator")).toBeVisible();
    await expect(page.getByTestId("rules-footer-token")).toContainText(
      "1 rules",
    );
    await expect(page.getByText(/\d+ alerts/)).toBeVisible();
    await expect(page.getByTestId("settings-link")).toBeVisible();
    await expect(page.getByTestId("theme-toggle")).toBeVisible();

    const footerTokenColors = await page.evaluate(() => {
      const rulesToken = document.querySelector(
        '[data-testid="rules-footer-token"]',
      );
      const alertsToken = document.querySelector(
        '[data-testid="alerts-count"]',
      );

      return {
        alerts:
          alertsToken === null
            ? null
            : window.getComputedStyle(alertsToken).color,
        rules:
          rulesToken === null
            ? null
            : window.getComputedStyle(rulesToken).color,
      };
    });

    expect(footerTokenColors.rules).toBe(footerTokenColors.alerts);

    const visibleFooterText = await statusBar.evaluate(
      (element) => (element as HTMLElement).innerText,
    );
    expect(visibleFooterText).not.toContain("interval");
  });

  test("pauses all tracking globally from the tracked rules header and resumes it", async ({
    page,
    request,
  }) => {
    const response = await request.post("/api/watch-rules", {
      data: {
        itemSlug: "arcane_barrier",
        maxPlatinum: 10,
      },
    });

    await expect(response).toBeOK();
    await page.goto("/");

    const pauseToggle = page.getByTestId("tracking-pause-toggle");
    const ruleStatus = page.locator(
      '[data-rule-slug="arcane_barrier"] [data-testid^="watchlist-rule-status-"]',
    );

    await expect(pauseToggle).toHaveAttribute(
      "aria-label",
      "Pause all tracking",
    );
    await expect(ruleStatus).toHaveAttribute("aria-label", "Rule enabled");

    await pauseToggle.hover();
    await expect(page.getByTestId("tracking-pause-tooltip")).toHaveText(
      "Stop tracking all rules",
    );
    await pauseToggle.click();
    await expect(page.getByTestId("tracking-pause-tooltip")).toBeHidden();

    await expect(pauseToggle).toHaveAttribute(
      "aria-label",
      "Resume all tracking",
    );
    await expect(ruleStatus).toHaveAttribute(
      "aria-label",
      "Tracking paused globally",
    );
    await pauseToggle.hover();
    await expect(page.getByTestId("tracking-pause-tooltip")).toHaveText(
      "Resume tracking for all rules",
    );
    await page.getByTestId("polling-indicator").hover();
    await expect(page.getByTestId("polling-tooltip")).toHaveText(
      "paused: tracking paused globally",
    );

    await page.waitForTimeout(1_700);
    await page.getByTestId("polling-indicator").hover();
    await expect(page.getByTestId("polling-tooltip")).toHaveText(
      "paused: tracking paused globally",
    );
    await expect(page.getByTestId("polling-indicator")).toHaveAttribute(
      "aria-label",
      "paused: tracking paused globally",
    );

    await expect
      .poll(async () => {
        const pausedSettingsResponse = await request.get("/api/settings");
        await expect(pausedSettingsResponse).toBeOK();
        const payload = await pausedSettingsResponse.json();
        return payload.trackingPaused;
      })
      .toBe(true);

    await pauseToggle.click();
    await expect(page.getByTestId("tracking-pause-tooltip")).toBeHidden();

    await expect(pauseToggle).toHaveAttribute(
      "aria-label",
      "Pause all tracking",
    );
    await expect(ruleStatus).toHaveAttribute("aria-label", "Rule enabled");
    await pauseToggle.hover();
    await expect(page.getByTestId("tracking-pause-tooltip")).toHaveText(
      "Stop tracking all rules",
    );

    await expect
      .poll(async () => {
        const resumedSettingsResponse = await request.get("/api/settings");
        await expect(resumedSettingsResponse).toBeOK();
        const payload = await resumedSettingsResponse.json();
        return payload.trackingPaused;
      })
      .toBe(false);
  });

  test("dashboard re-polls within the shared interval for seven tracked items", async ({
    page,
    request,
  }) => {
    for (const [index, itemSlug] of RAPID_POLL_ITEM_SLUGS.entries()) {
      const response = await request.post("/api/watch-rules", {
        data: {
          itemSlug,
          maxPlatinum: index + 10,
        },
      });

      await expect(response).toBeOK();
    }

    await expect
      .poll(async () => {
        const response = await request.get("/api/dashboard");
        const payload = await response.json();

        return payload.rules.length;
      })
      .toBe(7);

    const dashboardRequestTimestamps: number[] = [];
    page.on("response", (response) => {
      const url = new URL(response.url());

      if (url.pathname === "/api/dashboard") {
        dashboardRequestTimestamps.push(Date.now());
      }
    });

    await page.goto("/");
    await expect(page.getByTestId("rules-footer-token")).toContainText(
      "7 rules",
    );

    await expect
      .poll(() => dashboardRequestTimestamps.length, {
        timeout: 7_000,
      })
      .toBeGreaterThanOrEqual(2);
  });

  test("desktop panes use the restored zed chrome", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/");

    const watchlistPane = page
      .locator('[data-testid="watchlist-panel"]')
      .locator("xpath=ancestor::section[1]");
    const panelStyles = await watchlistPane.evaluate((element) => {
      const computed = window.getComputedStyle(element);
      return {
        borderTopLeftRadius: computed.borderTopLeftRadius,
        boxShadow: computed.boxShadow,
      };
    });

    expect(panelStyles.borderTopLeftRadius).toBe("0px");
    expect(panelStyles.boxShadow).toBe("none");
  });

  test("desktop pane headers align on the same baseline", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    const response = await request.post("/api/dev/reset", {
      data: { seed: "demo" },
    });

    await expect(response).toBeOK();

    await page.goto("/");
    await expect(page.getByTestId("market-header-item-link")).toBeVisible();

    const headerMetrics = await page.evaluate(() => {
      const watchHeader = document
        .querySelector('[data-testid="watchlist-panel"]')
        ?.closest("section")?.firstElementChild;
      const marketHeader = document.querySelector(
        '[data-testid="market-panel"] > div:first-child',
      );
      const alertsHeader = document
        .querySelector('[data-testid="alerts-panel"]')
        ?.closest("section")?.firstElementChild;

      const bottom = (element: Element | null | undefined) =>
        element?.getBoundingClientRect().bottom ?? null;

      return {
        alerts: bottom(alertsHeader),
        market: bottom(marketHeader),
        watch: bottom(watchHeader),
      };
    });

    expect(headerMetrics.watch).not.toBeNull();
    expect(headerMetrics.market).not.toBeNull();
    expect(headerMetrics.alerts).not.toBeNull();
    expect(
      Math.abs((headerMetrics.market ?? 0) - (headerMetrics.watch ?? 0)),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs((headerMetrics.market ?? 0) - (headerMetrics.alerts ?? 0)),
    ).toBeLessThanOrEqual(1);
  });

  test("can toggle theme", async ({ page }) => {
    await page.goto("/");

    const themeToggle = page.getByTestId("theme-toggle");
    const themeTooltip = page.getByTestId("theme-toggle-tooltip");
    await expect(themeToggle).toBeVisible();
    await expect(themeToggle).not.toHaveAttribute("title", /.+/);
    await expect(themeToggle).toHaveAttribute(
      "aria-label",
      "Theme: system. Activate to switch to light.",
    );
    await themeToggle.hover();
    await expect(themeTooltip).toBeVisible();
    await expect(themeTooltip).toHaveText("Theme: System");

    await themeToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect
      .poll(async () => page.evaluate(() => document.cookie))
      .toContain("wmt-theme=light");
    await expect(themeToggle).not.toHaveAttribute("title", /.+/);
    await expect(themeToggle).toHaveAttribute(
      "aria-label",
      "Theme: light. Activate to switch to dark.",
    );

    await themeToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(themeToggle).not.toHaveAttribute("title", /.+/);
    await expect(themeToggle).toHaveAttribute(
      "aria-label",
      "Theme: dark. Activate to switch to system.",
    );

    await themeToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(themeToggle).not.toHaveAttribute("title", /.+/);
    await expect(themeToggle).toHaveAttribute(
      "aria-label",
      "Theme: system. Activate to switch to light.",
    );
  });

  test("shows a hover tooltip for the settings control", async ({ page }) => {
    await page.goto("/");

    const settingsLink = page.getByTestId("settings-link");
    const settingsTooltip = page.getByTestId("settings-tooltip");

    await expect(settingsTooltip).toBeHidden();
    await settingsLink.hover();
    await expect(settingsTooltip).toBeVisible();
    await expect(settingsTooltip).toHaveText("Open settings");

    await settingsLink.click();
    await expect(page).toHaveURL(/\/settings$/);
    await settingsLink.hover();
    await expect(settingsTooltip).toBeVisible();
    await expect(settingsTooltip).toHaveText("Close settings");
  });

  test("does not request workspace slices on the settings page", async ({
    page,
    request,
  }) => {
    const response = await request.post("/api/dev/reset", {
      data: { seed: "demo" },
    });

    await expect(response).toBeOK();

    const workspaceRequests: string[] = [];
    page.on("pageerror", (error) => {
      throw error;
    });

    await page.route("**/api/workspace/**", async (route) => {
      workspaceRequests.push(route.request().url());
      await route.fulfill({
        body: JSON.stringify({
          error: "settings page should not request workspace data",
        }),
        contentType: "application/json",
        status: 500,
      });
    });

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    expect(workspaceRequests).toEqual([]);
  });

  test("shows set part estimates and can track a set part at its estimated price", async ({
    page,
  }) => {
    const baseRule = {
      createdAt: "2026-03-29T00:00:00.000Z",
      crossplay: true,
      enabled: true,
      id: "rule-set-1",
      itemSlug: "mesa_prime_set",
      maxPlatinum: 36,
      platform: "pc",
      sortOrder: 1,
      updatedAt: "2026-03-29T00:00:00.000Z",
      userId: "local-demo-user",
    };
    const createdPartRule = {
      createdAt: "2026-03-29T00:01:00.000Z",
      crossplay: true,
      enabled: true,
      id: "rule-part-1",
      itemSlug: "mesa_prime_systems_blueprint",
      maxPlatinum: 9,
      platform: "pc",
      sortOrder: 2,
      updatedAt: "2026-03-29T00:01:00.000Z",
      userId: "local-demo-user",
    };
    const createdPayloads: Array<{
      itemSlug: string;
      maxPlatinum?: number;
    }> = [];
    let currentRules = [baseRule];

    await page.route("**/api/dashboard", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          alerts: [],
          meta: {
            marketCrossplay: true,
            marketPlatform: "pc",
            safeRequestSpacingMs: 500,
            safeRequestsPerSecond: 2,
            theoreticalRequestsPerSecond: 2,
            trackingPaused: false,
          },
          rules: currentRules,
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.route("**/api/workspace/rule-set-1", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          marketTop: [],
          offlineOrders: [],
          onlineOrders: [],
          rule: baseRule,
          setPricing: {
            parts: [
              {
                estimatedPrice: 4,
                itemSlug: "mesa_prime_blueprint",
                name: "Mesa Prime Blueprint",
                variance: 1,
              },
              {
                estimatedPrice: 4,
                itemSlug: "mesa_prime_chassis_blueprint",
                name: "Mesa Prime Chassis Blueprint",
                variance: 1,
              },
              {
                estimatedPrice: 20,
                itemSlug: "mesa_prime_neuroptics_blueprint",
                name: "Mesa Prime Neuroptics Blueprint",
                variance: 5,
              },
              {
                estimatedPrice: 9,
                itemSlug: "mesa_prime_systems_blueprint",
                name: "Mesa Prime Systems Blueprint",
                variance: 1,
              },
            ],
            totalEstimatedPrice: 37,
            totalVariance: 8,
          },
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.route("**/api/workspace/rule-part-1", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          marketTop: [],
          offlineOrders: [],
          onlineOrders: [],
          rule: createdPartRule,
          setPricing: null,
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.route("**/api/watch-rules", async (route) => {
      const payload = route.request().postDataJSON() as {
        itemSlug: string;
        maxPlatinum?: number;
      };
      createdPayloads.push(payload);
      currentRules = [baseRule, createdPartRule];

      await route.fulfill({
        body: JSON.stringify(createdPartRule),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/");

    await expect
      .poll(() =>
        page.evaluate(async () => {
          const response = await fetch("/api/workspace/rule-set-1");
          const payload = await response.json();
          return payload.setPricing?.totalEstimatedPrice ?? null;
        }),
      )
      .toBe(37);

    await expect(page.getByTestId("market-panel")).toContainText(
      "Set Part Estimates",
    );
    await expect(page.getByTestId("market-panel")).toContainText(
      "Offline Reserves",
    );
    await expect(page.getByTestId("market-panel")).toContainText(
      "Mesa Prime Blueprint",
    );
    await expect(page.getByTestId("market-panel")).toContainText(
      "Mesa Prime Systems Blueprint",
    );
    await expect(page.getByTestId("market-panel")).toContainText("Estimate");
    await expect(page.getByTestId("market-panel")).toContainText("37p");
    await expect(page.getByTestId("market-panel")).toContainText("20p");
    await expect(page.getByTestId("market-panel")).toContainText("9p");
    await expect(
      page.getByTestId("set-part-link-mesa_prime_systems_blueprint"),
    ).toHaveAttribute(
      "href",
      "https://warframe.market/items/mesa_prime_systems_blueprint",
    );
    await expect(
      page.getByTestId("set-part-market-link-mesa_prime_systems_blueprint"),
    ).toHaveAttribute(
      "href",
      "https://warframe.market/items/mesa_prime_systems_blueprint",
    );
    await expect(
      page.getByTestId("set-part-track-mesa_prime_systems_blueprint"),
    ).toBeEnabled();

    const sectionOrder = await page
      .getByTestId("market-panel")
      .evaluate((element) => element.textContent ?? "");

    expect(sectionOrder.indexOf("Offline Reserves")).toBeLessThan(
      sectionOrder.indexOf("Set Part Estimates"),
    );

    await page
      .getByTestId("set-part-track-mesa_prime_systems_blueprint")
      .click();

    await expect
      .poll(() => createdPayloads)
      .toEqual([
        {
          itemSlug: "mesa_prime_systems_blueprint",
          maxPlatinum: 9,
        },
      ]);
    await expect(
      page.locator('[data-rule-slug="mesa_prime_systems_blueprint"]'),
    ).toContainText("Mesa Prime Systems Blueprint");
    await expect(
      page.getByTestId("set-part-track-mesa_prime_systems_blueprint"),
    ).toBeDisabled();
  });

  test("disables set part tracking when that part is already tracked", async ({
    page,
  }) => {
    const existingPartRule = {
      createdAt: "2026-03-29T00:01:00.000Z",
      crossplay: true,
      enabled: true,
      id: "rule-part-1",
      itemSlug: "mesa_prime_systems_blueprint",
      maxPlatinum: 9,
      platform: "pc",
      sortOrder: 2,
      updatedAt: "2026-03-29T00:01:00.000Z",
      userId: "local-demo-user",
    };

    await page.route("**/api/dashboard", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          alerts: [],
          meta: {
            marketCrossplay: true,
            marketPlatform: "pc",
            safeRequestSpacingMs: 500,
            safeRequestsPerSecond: 2,
            theoreticalRequestsPerSecond: 2,
            trackingPaused: false,
          },
          rules: [
            {
              createdAt: "2026-03-29T00:00:00.000Z",
              crossplay: true,
              enabled: true,
              id: "rule-set-1",
              itemSlug: "mesa_prime_set",
              maxPlatinum: 36,
              platform: "pc",
              sortOrder: 1,
              updatedAt: "2026-03-29T00:00:00.000Z",
              userId: "local-demo-user",
            },
            existingPartRule,
          ],
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.route("**/api/workspace/rule-set-1", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          marketTop: [],
          offlineOrders: [],
          onlineOrders: [],
          rule: {
            createdAt: "2026-03-29T00:00:00.000Z",
            crossplay: true,
            enabled: true,
            id: "rule-set-1",
            itemSlug: "mesa_prime_set",
            maxPlatinum: 36,
            platform: "pc",
            sortOrder: 1,
            updatedAt: "2026-03-29T00:00:00.000Z",
            userId: "local-demo-user",
          },
          setPricing: {
            parts: [
              {
                estimatedPrice: 9,
                itemSlug: "mesa_prime_systems_blueprint",
                name: "Mesa Prime Systems Blueprint",
                variance: 1,
              },
            ],
            totalEstimatedPrice: 9,
            totalVariance: 1,
          },
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/");

    await expect(
      page.getByTestId("set-part-track-mesa_prime_systems_blueprint"),
    ).toBeDisabled();
  });

  test("server-renders saved discord settings on refresh", async ({
    request,
  }) => {
    const resetResponse = await request.post("/api/dev/reset", {
      data: { seed: "empty" },
    });

    await expect(resetResponse).toBeOK();

    await saveEnabledDiscordSettings(request);

    const htmlResponse = await request.get("/settings");

    await expect(htmlResponse).toBeOK();

    const html = await htmlResponse.text();

    expect(html).toContain("Discord alert on");
    expect(html).not.toContain(">Discord alert<");
    expect(html).not.toContain(">Loading<");
  });

  test("uses the compact settings toggle copy and tighter desktop spacing", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/settings");

    const discordToggle = page.getByRole("switch", {
      name: /Discord alert off/i,
    });

    await expect(discordToggle).toBeVisible();
    await expect(page.getByText("alerts paused")).toHaveCount(0);
    await expect(page.getByText("alerts live")).toHaveCount(0);

    const settingsBody = page.locator("main > div").nth(1);
    const spacing = await settingsBody.evaluate((element) => {
      const computed = window.getComputedStyle(element);
      return {
        paddingLeft: computed.paddingLeft,
        paddingTop: computed.paddingTop,
      };
    });

    expect(spacing).toEqual({
      paddingLeft: "32px",
      paddingTop: "32px",
    });
  });

  test("uses the market tab treatment for the settings header", async ({
    page,
  }) => {
    await page.goto("/settings");

    const header = page.getByTestId("settings-tab-header");
    const navigation = page.getByTestId("settings-tab-navigation");
    const label = page.getByTestId("settings-tab-label");
    const icon = page.getByTestId("settings-tab-cog-icon");
    const close = page.getByTestId("settings-tab-close");

    await expect(header).toBeVisible();
    await expect(header).not.toContainText("src");
    await expect(header).not.toContainText("system");
    await expect(navigation).toBeVisible();
    await expect(label).toBeVisible();
    await expect(label).toHaveText("settings");
    await expect(header).not.toContainText("settings.config");
    await expect(label).toHaveClass(/text-text-primary/);

    await expect(icon).toBeVisible();
    await expect(icon).toHaveCSS("width", "14px");
    await expect(icon).toHaveCSS("height", "14px");

    await expect(close).toBeVisible();
    await expect(close).toHaveAttribute("href", "/");
    await expect(close).toHaveAttribute("aria-label", "Close settings tab");

    const metrics = await header.evaluate((element) => {
      const nav = element.querySelector(
        '[data-testid="settings-tab-navigation"]',
      );
      const tab = element.querySelector('[data-testid="settings-tab"]');
      const label = element.querySelector('[data-testid="settings-tab-label"]');
      const icon = element.querySelector(
        '[data-testid="settings-tab-cog-icon"]',
      );
      const close = element.querySelector('[data-testid="settings-tab-close"]');
      const labelRect = label?.getBoundingClientRect();
      const iconRect = icon?.getBoundingClientRect();
      const closeRect = close?.getBoundingClientRect();

      return {
        closeGap:
          iconRect && closeRect ? closeRect.left - iconRect.right : null,
        iconGap: labelRect && iconRect ? iconRect.left - labelRect.right : null,
        headerHeight: element.getBoundingClientRect().height,
        navHeight: nav?.getBoundingClientRect().height ?? null,
        tabWidth: tab?.getBoundingClientRect().width ?? null,
        tabHeight: tab?.getBoundingClientRect().height ?? null,
      };
    });

    expect(metrics.iconGap).toBeGreaterThanOrEqual(4);
    expect(metrics.iconGap).toBeLessThanOrEqual(8);
    expect(metrics.closeGap).toBeLessThanOrEqual(8);
    expect(metrics.headerHeight).toBe(36);
    expect(metrics.navHeight).toBeGreaterThanOrEqual(35);
    expect(metrics.tabHeight).toBeGreaterThanOrEqual(35);
    expect(metrics.tabWidth).toBeLessThanOrEqual(125);
    expect(metrics.navHeight).toBeLessThanOrEqual(metrics.headerHeight);
    expect(metrics.tabHeight).toBeLessThanOrEqual(metrics.headerHeight);
  });

  test("keeps the discord toggle thumb vertically centered in the track", async ({
    page,
  }) => {
    await page.goto("/settings");

    const discordToggle = page.getByTestId("toggle-switch");

    await expect(discordToggle).toBeVisible();
    await discordToggle.click();

    const metrics = await discordToggle.evaluate((toggle) => {
      const track = toggle.querySelector("span");
      const thumb = track?.querySelector("span");

      if (!(track instanceof HTMLElement) || !(thumb instanceof HTMLElement)) {
        return null;
      }

      const trackRect = track.getBoundingClientRect();
      const thumbRect = thumb.getBoundingClientRect();

      return {
        delta:
          thumbRect.top +
          thumbRect.height / 2 -
          (trackRect.top + trackRect.height / 2),
      };
    });

    expect(metrics).not.toBeNull();
    expect(Math.abs(metrics!.delta)).toBeLessThanOrEqual(0.5);
  });

  test("does not show a loading placeholder after refresh with saved settings", async ({
    page,
    request,
  }) => {
    const resetResponse = await request.post("/api/dev/reset", {
      data: { seed: "empty" },
    });

    await expect(resetResponse).toBeOK();

    await saveEnabledDiscordSettings(request);

    await page.goto("/settings");
    await expect(
      page.getByRole("switch", { name: /Discord alert on/i }),
    ).toBeVisible();
    await expect(page.getByText(/^Loading$/)).toHaveCount(0);
    await expect(
      page.getByRole("switch", { name: /^Discord alert$/i }),
    ).toHaveCount(0);
  });

  test("shows a success card after a Discord test message succeeds", async ({
    page,
    request,
  }) => {
    const resetResponse = await request.post("/api/dev/reset", {
      data: { seed: "empty" },
    });

    await expect(resetResponse).toBeOK();

    const saveResponse = await request.put("/api/settings", {
      data: {
        discordBotToken: "super-secret-token",
        discordChannelId: "123456789012345678",
        discordEnabled: true,
        trackingPaused: false,
      },
    });

    await expect(saveResponse).toBeOK();

    await page.route("**/api/settings-test", async (route) => {
      await route.fulfill({
        body: JSON.stringify({ success: true }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/settings");

    const testButton = page.getByRole("button", { name: "Test" });

    await expect(testButton).toBeEnabled();
    await testButton.click();

    const confirmationCard = page.getByTestId("discord-test-success-card");

    await expect(confirmationCard).toBeVisible();
    await expect(confirmationCard).toContainText("Discord test message sent");
    await expect(confirmationCard).toContainText(
      "The web app sent a test message to the configured channel.",
    );
    await expect(confirmationCard).toContainText(
      "Live alerts still require the worker service to use the same Discord settings.",
    );
    await expect(page.getByText("PONG")).toHaveCount(0);
    await expect(page.getByTestId("alerts-panel")).not.toContainText(
      "Discord test message sent",
    );
  });

  test("shows a failure state when the Discord test request fails", async ({
    page,
    request,
  }) => {
    const resetResponse = await request.post("/api/dev/reset", {
      data: { seed: "empty" },
    });

    await expect(resetResponse).toBeOK();

    const saveResponse = await request.put("/api/settings", {
      data: {
        discordBotToken: "super-secret-token",
        discordChannelId: "123456789012345678",
        discordEnabled: true,
        trackingPaused: false,
      },
    });

    await expect(saveResponse).toBeOK();

    await page.route("**/api/settings-test", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          error: "Discord notification failed: request timed out after 10000ms",
        }),
        contentType: "application/json",
        status: 503,
      });
    });

    await page.goto("/settings");

    const testButton = page.getByRole("button", { name: "Test" });

    await expect(testButton).toBeEnabled();
    await testButton.click();

    await expect(page.getByText("FAIL", { exact: true })).toBeVisible();
    await expect(page.getByTestId("discord-test-success-card")).toHaveCount(0);
    await expect(page.getByTestId("discord-test-error-card")).toContainText(
      "Discord notification failed: request timed out after 10000ms",
    );
  });

  test("clears a previous Discord test success when settings change", async ({
    page,
    request,
  }) => {
    const resetResponse = await request.post("/api/dev/reset", {
      data: { seed: "empty" },
    });

    await expect(resetResponse).toBeOK();

    const saveResponse = await request.put("/api/settings", {
      data: {
        discordBotToken: "super-secret-token",
        discordChannelId: "123456789012345678",
        discordEnabled: true,
        trackingPaused: false,
      },
    });

    await expect(saveResponse).toBeOK();

    await page.route("**/api/settings-test", async (route) => {
      await route.fulfill({
        body: JSON.stringify({ success: true }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/settings");

    const confirmationCard = page.getByTestId("discord-test-success-card");
    const testButton = page.getByRole("button", { name: "Test" });

    await expect(testButton).toBeEnabled();
    await testButton.click();
    await expect(confirmationCard).toBeVisible();

    await page
      .getByPlaceholder("Paste channel ID...")
      .fill("987654321098765432");

    await expect(confirmationCard).toBeHidden();
  });

  test("reuses cached settings on later visits", async ({ page, request }) => {
    const response = await request.post("/api/dev/reset", {
      data: { seed: "demo" },
    });

    await expect(response).toBeOK();

    let requestCount = 0;
    let releaseSecondResponse: (() => void) | undefined;
    const secondResponseReady = new Promise<void>((resolve) => {
      releaseSecondResponse = resolve;
    });

    await page.route("**/api/settings", async (route) => {
      requestCount += 1;

      if (requestCount === 1) {
        await route.fulfill({
          body: JSON.stringify({
            discordBotToken: "••••••••••••••••",
            discordChannelId: "123456789012345678",
            discordEnabled: true,
            trackingPaused: false,
            hasDiscordBotToken: true,
          }),
          contentType: "application/json",
          status: 200,
        });
        return;
      }

      await secondResponseReady;
      await route.fulfill({
        body: JSON.stringify({
          discordBotToken: "••••••••••••••••",
          discordChannelId: "123456789012345678",
          discordEnabled: true,
          trackingPaused: false,
          hasDiscordBotToken: true,
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/");
    await page.getByTestId("settings-link").click();
    await expect(
      page.getByRole("switch", { name: /Discord alert on/i }),
    ).toBeVisible();

    await page.getByTestId("settings-link").click();
    await page.getByTestId("settings-link").click();

    await expect(
      page.getByRole("switch", { name: /Discord alert on/i }),
    ).toBeVisible();

    releaseSecondResponse?.();
  });

  test("renders a simple not-found page with recovery actions", async ({
    page,
  }) => {
    test.fixme(
      true,
      "Solid Start alpha catch-all routes do not complete reliably in request-based E2E navigation.",
    );

    await page.goto("/void-relic/unknown-node", {
      timeout: 5000,
      waitUntil: "commit",
    });

    await expect(page).toHaveTitle(/Not Found|Page Missing/);
    await expect(page.getByTestId("not-found-page")).toBeVisible();
    await expect(page.getByTestId("not-found-status")).toContainText("404");
    await expect(
      page.getByRole("heading", { name: /Page Missing/i }),
    ).toBeVisible();
    await expect(
      page.getByText("The page you requested could not be found."),
    ).toBeVisible();
    await expect(page.getByTestId("not-found-home")).toBeVisible();
    await expect(page.getByTestId("not-found-back")).toBeVisible();
  });

  test("can create a new rule and view market data", async ({ page }) => {
    await page.goto("/");

    const priceInput = page.locator('input[name="maxPlatinum"]');
    const submitBtn = page.locator('button[type="submit"]');

    await expect(submitBtn).toHaveAttribute("aria-label", "Create watch rule");
    await expect(submitBtn).toHaveText("+");

    await selectItemByKeyboard(page, "arcane_barrier");
    await priceInput.fill("10");
    await submitBtn.click();

    await expect(page.getByTestId("watchlist-panel")).toContainText(
      "Arcane Barrier",
    );
    await expect(page.getByTestId(/rule-remove-/).first()).toHaveAttribute(
      "title",
      "Remove rule",
    );
    await expect(page.getByTestId("market-panel")).toContainText(
      "Arcane Barrier",
    );
  });

  test("links the active item header to Warframe Market", async ({ page }) => {
    await page.goto("/");

    await selectItemByKeyboard(page, "arcane_barrier");
    await page.locator('input[name="maxPlatinum"]').fill("10");
    await page.locator('button[type="submit"]').click();

    const marketUrl = "https://warframe.market/items/arcane_barrier";
    const itemLink = page.getByTestId("market-header-item-link");
    const cartLink = page.getByTestId("market-header-link-button");
    const tooltip = page.getByTestId("market-header-tooltip");

    await expect(itemLink).toBeVisible();
    await expect(itemLink).toHaveAttribute("href", marketUrl);
    await expect(itemLink).toHaveAttribute("target", "_blank");
    await expect(itemLink).toHaveAttribute(
      "aria-describedby",
      "market-header-tooltip",
    );
    await expect(itemLink).not.toHaveAttribute("title", /.+/);

    await expect(tooltip).toBeHidden();
    await itemLink.hover();
    await expect(itemLink).toHaveCSS("text-decoration-line", "underline");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText("Open this item on Warframe Market");
    const tooltipPosition = await Promise.all([
      itemLink.boundingBox(),
      tooltip.boundingBox(),
    ]);
    expect(tooltipPosition[0]).not.toBeNull();
    expect(tooltipPosition[1]).not.toBeNull();
    expect(tooltipPosition[1]!.y).toBeGreaterThanOrEqual(
      tooltipPosition[0]!.y + tooltipPosition[0]!.height,
    );
    const tooltipClipped = await page.evaluate(() => {
      const tooltip = document.querySelector(
        '[data-testid="market-header-tooltip"]',
      );

      if (!(tooltip instanceof HTMLElement)) {
        return true;
      }

      const rect = tooltip.getBoundingClientRect();
      let current = tooltip.parentElement;

      while (current) {
        const style = window.getComputedStyle(current);
        const currentRect = current.getBoundingClientRect();
        const clipsHorizontally = ["auto", "clip", "hidden", "scroll"].includes(
          style.overflowX,
        );
        const clipsVertically = ["auto", "clip", "hidden", "scroll"].includes(
          style.overflowY,
        );

        if (
          (clipsHorizontally &&
            (rect.left < currentRect.left || rect.right > currentRect.right)) ||
          (clipsVertically &&
            (rect.top < currentRect.top || rect.bottom > currentRect.bottom))
        ) {
          return true;
        }

        current = current.parentElement;
      }

      return false;
    });
    expect(tooltipClipped).toBe(false);

    await expect(cartLink).toBeVisible();
    await expect(cartLink).toHaveAttribute("href", marketUrl);
    await expect(cartLink).toHaveAttribute("target", "_blank");
    await expect(cartLink).toHaveAttribute(
      "aria-describedby",
      "market-header-tooltip",
    );
    await expect(cartLink).not.toHaveAttribute("title", /.+/);

    const [itemPopup] = await Promise.all([
      page.waitForEvent("popup"),
      itemLink.click(),
    ]);
    await expect.poll(() => itemPopup.url()).toContain(marketUrl);
    await itemPopup.close();

    const [cartPopup] = await Promise.all([
      page.waitForEvent("popup"),
      cartLink.click(),
    ]);
    await expect.poll(() => cartPopup.url()).toContain(marketUrl);
    await cartPopup.close();
  });

  test("warns when the target is below the current market floor", async ({
    page,
  }) => {
    await page.route("**/api/workspace/**", async (route) => {
      const ruleId = route.request().url().split("/").pop() ?? "rule-1";

      await route.fulfill({
        body: JSON.stringify({
          marketTop: [
            {
              id: "order-1",
              itemId: "item-1",
              platinum: 30,
              quantity: 1,
              rank: 0,
              type: "sell",
              updatedAt: "2026-03-21T00:01:00.000Z",
              user: {
                id: "seller-1",
                ingameName: "vash2000",
                lastSeen: "2026-03-21T00:01:00.000Z",
                slug: "vash2000",
                status: "online",
              },
              visible: true,
            },
          ],
          offlineOrders: [
            {
              id: "order-2",
              itemId: "item-1",
              platinum: 12,
              quantity: 1,
              rank: 0,
              type: "sell",
              updatedAt: "2026-03-21T00:02:00.000Z",
              user: {
                id: "seller-2",
                ingameName: "sleepy_leaf",
                lastSeen: "2026-03-21T00:02:00.000Z",
                slug: "sleepy_leaf",
                status: "offline",
              },
              visible: true,
            },
          ],
          onlineOrders: [
            {
              id: "order-3",
              itemId: "item-1",
              platinum: 15,
              quantity: 1,
              rank: 0,
              type: "sell",
              updatedAt: "2026-03-21T00:03:00.000Z",
              user: {
                id: "seller-3",
                ingameName: "embereye",
                lastSeen: "2026-03-21T00:03:00.000Z",
                slug: "embereye",
                status: "ingame",
              },
              visible: true,
            },
          ],
          rule: {
            createdAt: "2026-03-21T00:00:00.000Z",
            crossplay: true,
            enabled: true,
            id: ruleId,
            itemSlug: "arcane_barrier",
            maxPlatinum: 20,
            platform: "pc",
            sortOrder: 1,
            updatedAt: "2026-03-21T00:00:00.000Z",
            userId: "local-demo-user",
          },
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/");
    await selectItemByKeyboard(page, "arcane_barrier");
    await page.locator('input[name="maxPlatinum"]').fill("20");
    await page.locator('button[type="submit"]').click();

    await expect(page.getByTestId("market-price-warning")).toBeVisible();
    await expect(page.getByTestId("market-price-warning")).toContainText(
      "Your target is below the current market floor.",
    );
    await expect(
      page.getByText(/\d{2}:\d{2} [AP]M [A-Z]{3} \d{2}/),
    ).toBeVisible();
  });

  test("shows only 12 online sellers and offline reserves by default, then expands with load more", async ({
    page,
    request,
  }) => {
    const resetResponse = await request.post("/api/dev/reset", {
      data: { seed: "demo" },
    });

    await expect(resetResponse).toBeOK();

    const onlineOrders = Array.from({ length: 15 }, (_, index) =>
      createWorkspaceSellOrder({
        id: `online-${index + 1}`,
        ingameName: `online_seller_${String(index + 1).padStart(2, "0")}`,
        platinum: 20 + index,
        status: index % 2 === 0 ? "online" : "ingame",
      }),
    );
    const offlineOrders = Array.from({ length: 14 }, (_, index) =>
      createWorkspaceSellOrder({
        id: `offline-${index + 1}`,
        ingameName: `offline_seller_${String(index + 1).padStart(2, "0")}`,
        lastSeen: `2026-03-2${(index % 8) + 1}T00:00:00.000Z`,
        platinum: 40 + index,
        status: "offline",
      }),
    );

    await page.route("**/api/workspace/**", async (route) => {
      const ruleId = route.request().url().split("/").pop() ?? "rule-1";

      await route.fulfill({
        body: JSON.stringify({
          marketTop: onlineOrders.slice(0, 12),
          offlineOrders,
          onlineOrders,
          rule: {
            createdAt: "2026-03-21T00:00:00.000Z",
            crossplay: true,
            enabled: true,
            id: ruleId,
            itemSlug: "wisp_prime_set",
            maxPlatinum: 999,
            platform: "pc",
            sortOrder: 0,
            updatedAt: "2026-03-21T00:00:00.000Z",
            userId: "local-demo-user",
          },
          setPricing: null,
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/");

    await expect(page.getByTestId("market-panel")).toContainText(
      "online_seller_12",
    );
    await expect(page.getByTestId("market-panel")).not.toContainText(
      "online_seller_13",
    );
    await expect(page.getByTestId("market-panel")).toContainText(
      "offline_seller_12",
    );
    await expect(page.getByTestId("market-panel")).not.toContainText(
      "offline_seller_13",
    );

    const loadMoreOnline = page.getByRole("button", {
      name: "Load More Online Sellers",
    });
    const loadMoreOffline = page.getByRole("button", {
      name: "Load More Offline Reserves",
    });

    await expect(loadMoreOnline).toBeVisible();
    await expect(loadMoreOffline).toBeVisible();

    await loadMoreOnline.click();
    await expect(page.getByTestId("market-panel")).toContainText(
      "online_seller_15",
    );
    await expect(loadMoreOnline).toBeHidden();

    await loadMoreOffline.click();
    await expect(page.getByTestId("market-panel")).toContainText(
      "offline_seller_14",
    );
    await expect(loadMoreOffline).toBeHidden();
  });

  test("shows autocomplete suggestions and creates a rule from keyboard selection", async ({
    page,
  }) => {
    await page.route("**/api/item-search**", async (route) => {
      const url = new URL(route.request().url());
      const query = url.searchParams.get("q");

      if (query?.includes("primed")) {
        await route.fulfill({
          body: JSON.stringify({
            items: [
              {
                name: "Primed Continuity",
                slug: "primed_continuity",
                thumb: "primed_continuity.png",
              },
              {
                name: "Primed Chamber",
                slug: "primed_chamber",
                thumb: "primed_chamber.png",
              },
            ],
          }),
          contentType: "application/json",
          status: 200,
        });
        return;
      }

      await route.fulfill({
        body: JSON.stringify({ items: [] }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/");

    const slugInput = page.locator('input[name="itemSlug"]');

    await slugInput.fill("primed c");
    await expect(page.getByTestId("item-search-listbox")).toBeVisible();
    await expect(page.getByTestId("item-search-option-0")).toContainText(
      "Primed Continuity",
    );
    await expect(page.getByTestId("item-search-option-0")).not.toContainText(
      "primed_continuity",
    );
    await expect(page.getByTestId("item-search-option-0")).toHaveAttribute(
      "title",
      "Primed Continuity (primed_continuity)",
    );

    await slugInput.press("ArrowDown");
    await slugInput.press("Enter");

    await expect(slugInput).toHaveValue("Primed Continuity");

    await page.locator('input[name="maxPlatinum"]').fill("35");
    await page.locator('button[type="submit"]').click();

    await expect(page.getByTestId("watchlist-panel")).toContainText(
      "Primed Continuity",
    );
  });

  test("accepts an exact raw slug entry without forcing a suggestion click", async ({
    page,
  }) => {
    await page.route("**/api/item-search**", async (route) => {
      const url = new URL(route.request().url());
      const query = url.searchParams.get("q");

      if (query?.includes("arcane_barrier")) {
        await route.fulfill({
          body: JSON.stringify({
            items: [
              {
                name: "Arcane Barrier",
                slug: "arcane_barrier",
                thumb: "arcane_barrier.png",
              },
            ],
          }),
          contentType: "application/json",
          status: 200,
        });
        return;
      }

      if (query?.includes("primed_continuity")) {
        await route.fulfill({
          body: JSON.stringify({
            items: [
              {
                name: "Primed Continuity",
                slug: "primed_continuity",
                thumb: "primed_continuity.png",
              },
            ],
          }),
          contentType: "application/json",
          status: 200,
        });
        return;
      }

      if (
        query?.includes("wisp_prime_set") ||
        query?.includes("wisp") ||
        query?.includes("wisp prime set")
      ) {
        await route.fulfill({
          body: JSON.stringify({
            items: [
              {
                name: "Wisp Prime Set",
                slug: "wisp_prime_set",
                thumb: "wisp_prime_set.png",
              },
            ],
          }),
          contentType: "application/json",
          status: 200,
        });
        return;
      }

      await route.fulfill({
        body: JSON.stringify({ items: [] }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/");

    await page.locator('input[name="itemSlug"]').fill("primed_continuity");
    await page.locator('input[name="maxPlatinum"]').fill("35");
    await page.locator('button[type="submit"]').click();

    await expect(page.getByTestId("watchlist-panel")).toContainText(
      "Primed Continuity",
    );
  });

  test("shows autocomplete suggestions for reordered search tokens", async ({
    page,
  }) => {
    await page.goto("/");

    const slugInput = page.locator('input[name="itemSlug"]');

    await slugInput.fill("continuity primed");

    await expect(page.getByTestId("item-search-listbox")).toBeVisible();
    await expect(page.getByTestId("item-search-option-0")).toContainText(
      "Primed Continuity",
    );

    await slugInput.press("ArrowDown");
    await slugInput.press("Enter");

    await expect(slugInput).toHaveValue("Primed Continuity");
  });

  test("shows autocomplete suggestions for small typing mistakes", async ({
    page,
  }) => {
    await page.goto("/");

    const slugInput = page.locator('input[name="itemSlug"]');

    await slugInput.fill("primd continuty");

    await expect(page.getByTestId("item-search-listbox")).toBeVisible();
    await expect(page.getByTestId("item-search-option-0")).toContainText(
      "Primed Continuity",
    );

    await slugInput.press("ArrowDown");
    await slugInput.press("Enter");

    await expect(slugInput).toHaveValue("Primed Continuity");
  });

  test("keeps the pause toggle below the item search suggestions", async ({
    page,
  }) => {
    await page.goto("/");

    const slugInput = page.locator('input[name="itemSlug"]');
    const pauseToggle = page.getByTestId("tracking-pause-toggle");
    const firstSuggestion = page.getByRole("option", {
      name: "Primed Continuity",
    });

    await slugInput.fill("pri");

    await expect(firstSuggestion).toBeVisible();
    await expect(pauseToggle).toBeVisible();

    const stacking = await page.evaluate(() => {
      const listbox = document.querySelector(
        '[data-testid="item-search-listbox"]',
      );
      const pauseGroup = document.querySelector(
        '[data-testid="tracking-pause-toggle"]',
      )?.parentElement;

      if (
        !(listbox instanceof HTMLElement) ||
        !(pauseGroup instanceof HTMLElement)
      ) {
        return null;
      }

      return {
        listZIndex: Number(getComputedStyle(listbox).zIndex || 0),
        pauseGroupZIndex: Number(getComputedStyle(pauseGroup).zIndex || 0),
      };
    });

    expect(stacking).not.toBeNull();
    expect(stacking!.listZIndex).toBeGreaterThan(stacking!.pauseGroupZIndex);
  });

  test("keeps the rule status dot vertically aligned with the tracked rule row", async ({
    page,
  }) => {
    await page.route("**/api/item-search**", async (route) => {
      const url = new URL(route.request().url());

      if (url.searchParams.get("q") === "arcane_barrier") {
        await route.fulfill({
          body: JSON.stringify({
            items: [
              {
                name: "Arcane Barrier",
                slug: "arcane_barrier",
                thumb: "arcane_barrier.png",
              },
            ],
          }),
          contentType: "application/json",
          status: 200,
        });
        return;
      }

      await route.fulfill({
        body: JSON.stringify({ items: [] }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/");

    await selectItemByKeyboard(page, "arcane_barrier");
    await page.locator('input[name="maxPlatinum"]').fill("10");
    await page.locator('button[type="submit"]').click();

    const geometry = await page
      .locator('[data-rule-slug="arcane_barrier"]')
      .first()
      .evaluate((element) => {
        const rowRect = element.getBoundingClientRect();
        const dot = element.querySelector(
          '[data-testid^="watchlist-rule-status-"]',
        );

        if (!(dot instanceof HTMLElement)) {
          throw new Error("Missing watchlist rule status dot");
        }

        const dotRect = dot.getBoundingClientRect();

        return {
          dot: {
            height: dotRect.height,
            y: dotRect.y,
          },
          row: {
            height: rowRect.height,
            y: rowRect.y,
          },
        };
      });

    const rowCenterY = geometry.row.y + geometry.row.height / 2;
    const dotCenterY = geometry.dot.y + geometry.dot.height / 2;

    expect(Math.abs(rowCenterY - dotCenterY)).toBeLessThanOrEqual(2);
  });

  test("supports autocomplete inside the mobile watchlist drawer", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.route("**/api/item-search**", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          items: [
            {
              name: "Primed Continuity",
              slug: "primed_continuity",
              thumb: "primed_continuity.png",
            },
          ],
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/");
    await page.getByTestId("panel-toggle-rules").click();

    const slugInput = page.locator('input[name="itemSlug"]');
    await slugInput.fill("primed");

    await expect(page.getByTestId("item-search-listbox")).toBeVisible();
    await page.getByTestId("item-search-option-0").click();
    await page.locator('input[name="maxPlatinum"]').fill("20");
    await page.locator('button[type="submit"]').click();

    await expect(page.getByTestId("watchlist-panel")).toContainText(
      "Primed Continuity",
    );
  });

  test("uses a solid accent-gold create button", async ({ page }) => {
    await page.goto("/");

    const submitBtn = page.getByTestId("watchlist-submit");
    const submitTooltip = page.getByTestId("watchlist-submit-tooltip");

    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toHaveAttribute(
      "aria-describedby",
      "watchlist-submit-tooltip",
    );
    await expect(submitTooltip).toBeHidden();
    await submitBtn.hover();
    await expect(submitTooltip).toBeVisible();
    await expect(submitTooltip).toHaveText("Create watch rule");

    const themeTokens = await page.locator("html").evaluate((element) => {
      const computed = window.getComputedStyle(element);

      return {
        accentGold: computed.getPropertyValue("--theme-accent-gold").trim(),
        textPrimary: computed.getPropertyValue("--theme-text-primary").trim(),
      };
    });

    expect(themeTokens.accentGold).toMatch(/^#c5a[0-9a-f]{3}$/i);
    expect(themeTokens.textPrimary).toBe("#e2e8f0");

    const submitStyles = await submitBtn.evaluate((element) => {
      const computed = window.getComputedStyle(element);

      return {
        backgroundColor: computed.backgroundColor,
        borderTopColor: computed.borderTopColor,
        color: computed.color,
      };
    });

    expect(submitStyles.backgroundColor).toMatch(
      /rgb\((197|198|200),\s(168|169|171),\s(105|106|108)\)/,
    );
    expect(submitStyles.borderTopColor).toMatch(
      /rgb\((197|198|200),\s(168|169|171),\s(105|106|108)\)/,
    );
    expect(submitStyles.color).toBe("rgb(255, 255, 255)");
  });

  test("keeps the create and remove actions on the same watchlist column", async ({
    page,
  }) => {
    await page.goto("/");

    await selectItemByKeyboard(page, "primed_continuity");
    await page.locator('input[name="maxPlatinum"]').fill("35");
    await page.locator('button[type="submit"]').click();

    const submitBounds = await page
      .getByTestId("watchlist-submit")
      .boundingBox();
    const removeButton = page.getByTestId(/rule-remove-/).first();
    await expect(removeButton).toBeVisible();
    const removeBounds = await removeButton.boundingBox();

    expect(submitBounds).not.toBeNull();
    expect(removeBounds).not.toBeNull();

    const submitCenterX = submitBounds!.x + submitBounds!.width / 2;
    const removeCenterX = removeBounds!.x + removeBounds!.width / 2;

    expect(Math.abs(submitCenterX - removeCenterX)).toBeLessThanOrEqual(1);
  });

  test("can update a tracked rule threshold without deleting it", async ({
    page,
  }) => {
    await page.goto("/");

    await selectItemByKeyboard(page, "arcane_barrier");
    await page.locator('input[name="maxPlatinum"]').fill("10");
    await page.locator('button[type="submit"]').click();

    await expect(page.getByTestId("watchlist-panel")).toContainText("≤ 10p");

    await page
      .getByTestId(/rule-threshold-edit-/)
      .first()
      .click();
    await page
      .getByTestId(/rule-threshold-input-/)
      .first()
      .fill("40");
    await page
      .getByTestId(/rule-threshold-save-/)
      .first()
      .click();

    await expect(page.getByTestId("watchlist-panel")).toContainText("≤ 40p");
    await expect(page.getByTestId("market-panel")).toContainText("40p");
  });

  test("keeps the threshold input focused across dashboard polling while editing", async ({
    page,
    request,
  }) => {
    for (const [index, itemSlug] of RAPID_POLL_ITEM_SLUGS.entries()) {
      const response = await request.post("/api/watch-rules", {
        data: {
          itemSlug,
          maxPlatinum: index + 10,
        },
      });

      await expect(response).toBeOK();
    }

    await page.goto("/");
    await expect(page.getByTestId("rules-footer-token")).toContainText(
      "7 rules",
    );

    await page
      .getByTestId(/rule-threshold-edit-/)
      .first()
      .click();

    const thresholdInput = page.getByTestId(/rule-threshold-input-/).first();
    await thresholdInput.focus();
    await expect(thresholdInput).toBeFocused();
    await thresholdInput.pressSequentially("2");

    const nextDashboardResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());

      return (
        url.pathname === "/api/dashboard" &&
        response.request().method() === "GET"
      );
    });

    await nextDashboardResponse;

    await expect(thresholdInput).toBeFocused();
  });

  test("reorders tracked rules with drag and drop and persists after refresh", async ({
    page,
    request,
  }) => {
    const firstRuleResponse = await request.post("/api/watch-rules", {
      data: {
        itemSlug: "arcane_barrier",
        maxPlatinum: 10,
      },
    });
    await expect(firstRuleResponse).toBeOK();

    const secondRuleResponse = await request.post("/api/watch-rules", {
      data: {
        itemSlug: "primed_continuity",
        maxPlatinum: 20,
      },
    });
    await expect(secondRuleResponse).toBeOK();

    const thirdRuleResponse = await request.post("/api/watch-rules", {
      data: {
        itemSlug: "wisp_prime_set",
        maxPlatinum: 30,
      },
    });
    await expect(thirdRuleResponse).toBeOK();

    await page.goto("/");

    await expect
      .poll(async () =>
        page
          .locator("[data-rule-slug]")
          .evaluateAll((elements) =>
            elements.map((element) => element.getAttribute("data-rule-slug")),
          ),
      )
      .toEqual(["arcane_barrier", "primed_continuity", "wisp_prime_set"]);

    const dragSourceRow = page.locator(
      '[data-rule-slug="wisp_prime_set"] [data-testid^="watchlist-rule-drag-surface-"]',
    );
    const targetRow = page.locator('[data-rule-slug="arcane_barrier"]');

    await expect(dragSourceRow).toBeVisible();
    await expect(targetRow).toBeVisible();
    await dragSourceRow.dragTo(targetRow);

    await expect
      .poll(async () =>
        page
          .locator("[data-rule-slug]")
          .evaluateAll((elements) =>
            elements.map((element) => element.getAttribute("data-rule-slug")),
          ),
      )
      .toEqual(["wisp_prime_set", "arcane_barrier", "primed_continuity"]);
    await expect
      .poll(async () => {
        const dashboardResponse = await request.get("/api/dashboard");
        const dashboard = (await dashboardResponse.json()) as {
          rules: Array<{ itemSlug: string }>;
        };

        return dashboard.rules.map((rule) => rule.itemSlug);
      })
      .toEqual(["wisp_prime_set", "arcane_barrier", "primed_continuity"]);

    await page.reload();

    await expect
      .poll(async () =>
        page
          .locator("[data-rule-slug]")
          .evaluateAll((elements) =>
            elements.map((element) => element.getAttribute("data-rule-slug")),
          ),
      )
      .toEqual(["wisp_prime_set", "arcane_barrier", "primed_continuity"]);
  });

  test("opens a tracked rule when it is dropped into the market pane", async ({
    page,
    request,
  }) => {
    const firstRuleResponse = await request.post("/api/watch-rules", {
      data: {
        itemSlug: "arcane_barrier",
        maxPlatinum: 10,
      },
    });
    await expect(firstRuleResponse).toBeOK();

    const secondRuleResponse = await request.post("/api/watch-rules", {
      data: {
        itemSlug: "primed_continuity",
        maxPlatinum: 20,
      },
    });
    await expect(secondRuleResponse).toBeOK();

    await page.goto("/");

    const marketPanel = page.getByTestId("market-panel");
    await expect(marketPanel).toContainText("Arcane Barrier");

    const dragSource = page.locator(
      '[data-rule-slug="primed_continuity"] [data-testid^="watchlist-rule-drag-surface-"]',
    );

    await expect(dragSource).toBeVisible();
    await dragSource.dragTo(marketPanel);

    await expect(marketPanel).toContainText("Primed Continuity");
  });

  test("shows a confirmation dialog before deleting a rule", async ({
    page,
  }) => {
    await page.goto("/");

    await selectItemByKeyboard(page, "arcane_barrier");
    await page.locator('input[name="maxPlatinum"]').fill("10");
    await page.locator('button[type="submit"]').click();

    await expect(page.getByTestId("watchlist-panel")).toContainText(
      "Arcane Barrier",
    );

    await page
      .getByTestId(/rule-remove-/)
      .first()
      .click();

    const confirmDialog = page.getByTestId("confirm-dialog-panel");

    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText("Delete rule");
    await expect(confirmDialog).toContainText(
      "Remove Arcane Barrier from tracking?",
    );

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(confirmDialog).toBeHidden();
    await expect(page.getByTestId("watchlist-panel")).toContainText(
      "Arcane Barrier",
    );
  });

  test("deletes a rule after confirmation", async ({ page }) => {
    await page.goto("/");

    await selectItemByKeyboard(page, "arcane_barrier");
    await page.locator('input[name="maxPlatinum"]').fill("10");
    await page.locator('button[type="submit"]').click();

    await expect(page.getByTestId("watchlist-panel")).toContainText(
      "Arcane Barrier",
    );

    await page
      .getByTestId(/rule-remove-/)
      .first()
      .click();
    await page.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByTestId("watchlist-panel")).not.toContainText(
      "Arcane Barrier",
    );
    await expect(page.locator("text=No active watch rules")).toBeVisible();
  });

  test("can delete an alert from the feed", async ({ page, request }) => {
    const response = await request.post("/api/dev/reset", {
      data: { seed: "demo" },
    });

    await expect(response).toBeOK();

    await page.goto("/");

    await expect(page.getByTestId("alerts-panel")).toContainText(
      "Arcane Barrier",
    );
    await page
      .getByTestId(/alert-remove-/)
      .first()
      .click();
    await expect(page.getByTestId("alerts-panel")).not.toContainText(
      "Arcane Barrier",
    );
  });

  test("can clear all alerts from the feed", async ({ page, request }) => {
    const response = await request.post("/api/dev/reset", {
      data: { seed: "demo" },
    });

    await expect(response).toBeOK();

    await page.goto("/");

    await expect(page.getByTestId("alerts-panel")).toContainText(
      "Arcane Barrier",
    );
    await page.getByTestId("alerts-clear-all").click();
    await expect(page.getByTestId("alerts-panel")).not.toContainText(
      "Arcane Barrier",
    );

    await page.reload();

    await expect(page.getByTestId("alerts-panel")).not.toContainText(
      "Arcane Barrier",
    );
  });

  test("can open an alert item in the dashboard and on Warframe Market", async ({
    page,
    request,
  }) => {
    const resetResponse = await request.post("/api/dev/reset", {
      data: { seed: "demo" },
    });

    await expect(resetResponse).toBeOK();

    const createRuleResponse = await request.post("/api/watch-rules", {
      data: {
        itemSlug: "primed_continuity",
        maxPlatinum: 25,
      },
    });

    await expect(createRuleResponse).toBeOK();

    await page.goto("/");

    const alertsPanel = page.getByTestId("alerts-panel");
    const marketPanel = page.getByTestId("market-panel");
    const viewButton = page.getByTestId(/alert-view-/).first();
    const marketLink = page.getByTestId(/alert-market-/).first();
    const deleteButton = page.getByTestId(/alert-remove-/).first();
    const viewTooltip = page.getByTestId(/alert-view-tooltip-/).first();
    const marketTooltip = page.getByTestId(/alert-market-tooltip-/).first();
    const deleteTooltip = page.getByTestId(/alert-delete-tooltip-/).first();
    const marketUrl = "https://warframe.market/items/arcane_barrier";

    await expect(alertsPanel).toContainText("Arcane Barrier");
    await expect(page.getByTestId(/alert-read-/)).toHaveCount(0);
    await expect(viewButton).toBeVisible();
    await expect(marketLink).toBeVisible();
    await expect(marketLink).toHaveAttribute("href", marketUrl);
    await expect(marketLink).toHaveAttribute("target", "_blank");
    await expect(deleteButton).toBeVisible();
    await expect(viewTooltip).toBeHidden();
    await expect(marketTooltip).toBeHidden();
    await expect(deleteTooltip).toBeHidden();

    await viewButton.hover();
    await expect(viewTooltip).toBeVisible();
    await expect(viewTooltip).toHaveText("View item in dashboard");

    await marketLink.hover();
    await expect(marketTooltip).toBeVisible();
    await expect(marketTooltip).toHaveText("Open item on Warframe Market");

    await deleteButton.hover();
    await expect(deleteTooltip).toBeVisible();
    await expect(deleteTooltip).toHaveText("Delete alert");

    await page.getByText("Primed Continuity").click();
    await expect(marketPanel).toContainText("Primed Continuity");

    await viewButton.click();
    await expect(marketPanel).toContainText("Arcane Barrier");
    await expect(alertsPanel).toContainText("Arcane Barrier");

    const [marketPopup] = await Promise.all([
      page.waitForEvent("popup"),
      marketLink.click(),
    ]);
    await expect.poll(() => marketPopup.url()).toContain(marketUrl);
    await marketPopup.close();
  });

  test("can copy a trade message from an alert", async ({ page, request }) => {
    const resetResponse = await request.post("/api/dev/reset", {
      data: { seed: "demo" },
    });

    await expect(resetResponse).toBeOK();

    await page.addInitScript(() => {
      const writes: string[] = [];

      Object.defineProperty(window, "__clipboardWrites", {
        configurable: true,
        value: writes,
      });

      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            writes.push(value);
          },
        },
      });
    });

    await page.goto("/");

    const copyButton = page.getByTestId(/alert-copy-/).first();
    const copyTooltip = page.getByTestId(/alert-copy-tooltip-/).first();
    const alertsPanel = page.getByTestId("alerts-panel");
    const tradeMessage =
      '/w LotusRelay Hi! Want to buy "Arcane Barrier" for 9 platinum. (warframe.market)';

    await expect(copyButton).toBeVisible();
    await expect(copyButton).toHaveText("");
    await expect(copyTooltip).toBeHidden();
    await expect(alertsPanel).not.toContainText(tradeMessage);

    await copyButton.hover();
    await expect(copyTooltip).toBeVisible();
    await expect(copyTooltip).toHaveText("Copy trade message");

    await copyButton.click();

    await expect(alertsPanel).toContainText("Trade message copied.");

    await expect
      .poll(() =>
        page.evaluate(() => {
          const writes = (
            window as typeof window & {
              __clipboardWrites?: string[];
            }
          ).__clipboardWrites;

          return writes?.at(-1) ?? null;
        }),
      )
      .toBe(tradeMessage);
  });

  test("uses a stronger delete hover state than the base state in light mode", async ({
    page,
  }) => {
    await page.goto("/");

    const themeToggle = page.getByTestId("theme-toggle");
    await themeToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await selectItemByKeyboard(page, "arcane_barrier");
    await page.locator('input[name="maxPlatinum"]').fill("10");
    await page.locator('button[type="submit"]').click();

    await expect(page.getByTestId("watchlist-panel")).toContainText(
      "Arcane Barrier",
    );
    await page
      .getByTestId(/rule-remove-/)
      .first()
      .click();

    const deleteButton = page.getByRole("button", { name: "Delete" });

    await expect(deleteButton).toBeVisible();

    const themeDangerTokens = await page.locator("html").evaluate((element) => {
      const computed = window.getComputedStyle(element);

      return {
        baseBackground: computed.getPropertyValue("--confirm-danger-bg").trim(),
        baseBorder: computed.getPropertyValue("--confirm-danger-border").trim(),
        baseText: computed.getPropertyValue("--confirm-danger-text").trim(),
        hoverBackground: computed
          .getPropertyValue("--confirm-danger-hover-bg")
          .trim(),
        hoverBorder: computed
          .getPropertyValue("--confirm-danger-hover-border")
          .trim(),
        hoverText: computed
          .getPropertyValue("--confirm-danger-hover-text")
          .trim(),
      };
    });

    expect(themeDangerTokens).toEqual({
      baseBackground: "#7f1d2d",
      baseBorder: "#991b1b",
      baseText: "#fff1f2",
      hoverBackground: "#b91c1c",
      hoverBorder: "#be123c",
      hoverText: "#fff7f7",
    });

    const baseStyles = await deleteButton.evaluate((element) => {
      const computed = window.getComputedStyle(element);

      return {
        backgroundColor: computed.backgroundColor,
        borderColor: computed.borderColor,
        color: computed.color,
      };
    });

    expect(baseStyles).toEqual({
      backgroundColor: "rgb(127, 29, 45)",
      borderColor: "rgb(153, 27, 27)",
      color: "rgb(255, 241, 242)",
    });
  });

  test("keeps the polling ring idle until tracked items exist", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("polling-indicator")).toBeVisible();

    const initialProgress = await page
      .getByTestId("polling-indicator")
      .evaluate((element) =>
        window
          .getComputedStyle(element)
          .getPropertyValue("--polling-progress")
          .trim(),
      );

    await page.waitForTimeout(350);

    const nextProgress = await page
      .getByTestId("polling-indicator")
      .evaluate((element) =>
        window
          .getComputedStyle(element)
          .getPropertyValue("--polling-progress")
          .trim(),
      );

    expect(Number(nextProgress)).toBe(Number(initialProgress));
  });

  test("worker health toast stays hidden when the worker is healthy", async ({
    page,
  }) => {
    const rule = createWorkerHealthRule();
    const dashboardResponsePromise = page.waitForResponse("**/api/dashboard");

    await page.route("**/api/dashboard", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          alerts: [],
          meta: createWorkerHealthMeta({
            trackingPaused: false,
            workerHealth: {
              consecutiveFailures: 0,
              lastCycleStartedAt: "2026-03-30T00:00:00.000Z",
              lastErrorMessage: null,
              lastSuccessfulCycleAt: "2026-03-30T00:00:10.000Z",
              trackingPaused: false,
            },
          }),
          rules: [rule],
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.route("**/api/workspace/rule-health-1", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          marketTop: [],
          offlineOrders: [],
          onlineOrders: [],
          rule,
          setPricing: null,
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/");
    await dashboardResponsePromise;

    await expect(page.getByTestId("worker-health-toast")).toHaveCount(0);
  });

  test("worker health toast appears when the worker is unhealthy", async ({
    page,
  }) => {
    const rule = createWorkerHealthRule();
    const dashboardResponsePromise = page.waitForResponse("**/api/dashboard");

    await page.route("**/api/dashboard", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          alerts: [],
          meta: createWorkerHealthMeta({
            trackingPaused: false,
            workerHealth: {
              consecutiveFailures: 1,
              lastCycleStartedAt: null,
              lastErrorMessage: "Worker health unavailable",
              lastSuccessfulCycleAt: null,
              trackingPaused: false,
            },
          }),
          rules: [rule],
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.route("**/api/workspace/rule-health-1", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          marketTop: [],
          offlineOrders: [],
          onlineOrders: [],
          rule,
          setPricing: null,
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/");
    await dashboardResponsePromise;

    await expect(page.getByTestId("worker-health-toast")).toBeVisible();
    await expect(page.getByTestId("worker-health-toast")).toContainText(
      "Worker health check failing. Alerts may be delayed.",
    );
  });

  test("worker health toast stays hidden while tracking is paused", async ({
    page,
  }) => {
    const rule = createWorkerHealthRule();
    const dashboardResponsePromise = page.waitForResponse("**/api/dashboard");

    await page.route("**/api/dashboard", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          alerts: [],
          meta: createWorkerHealthMeta({
            trackingPaused: true,
            workerHealth: {
              consecutiveFailures: 1,
              lastCycleStartedAt: null,
              lastErrorMessage: "Worker health unavailable",
              lastSuccessfulCycleAt: null,
              trackingPaused: false,
            },
          }),
          rules: [rule],
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.route("**/api/workspace/rule-health-1", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          marketTop: [],
          offlineOrders: [],
          onlineOrders: [],
          rule,
          setPricing: null,
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/");
    await dashboardResponsePromise;

    await expect(page.getByTestId("worker-health-toast")).toHaveCount(0);
  });

  test("database failure shows a dashboard warning toast", async ({ page }) => {
    const dashboardResponsePromise = page.waitForResponse("**/api/dashboard");

    await page.route("**/api/dashboard", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          error: "Database unavailable",
        }),
        contentType: "application/json",
        status: 503,
      });
    });

    await page.goto("/");
    await dashboardResponsePromise;

    await expect(page.getByTestId("worker-health-toast")).toBeVisible();
    await expect(page.getByTestId("worker-health-toast")).toContainText(
      "Database unavailable. Dashboard may be stale.",
    );
  });

  test("uses the restored hollow polling ring without a teal center", async ({
    page,
  }) => {
    await page.goto("/");

    const ringStyles = await page
      .getByTestId("polling-indicator")
      .evaluate((element) => {
        const host = window.getComputedStyle(element);
        const core = window.getComputedStyle(element, "::after");

        return {
          backgroundImage: host.backgroundImage,
          coreBackground: core.backgroundColor,
        };
      });

    expect(ringStyles.backgroundImage).toContain("conic-gradient");
    expect(ringStyles.coreBackground).toBe("rgba(0, 0, 0, 0)");
  });

  test("keeps the polling hover text reactive while tracking items", async ({
    page,
    request,
  }) => {
    for (const [index, itemSlug] of RAPID_POLL_ITEM_SLUGS.entries()) {
      const response = await request.post("/api/watch-rules", {
        data: {
          itemSlug,
          maxPlatinum: index + 10,
        },
      });

      await expect(response).toBeOK();
    }

    await page.goto("/");

    const indicator = page.getByTestId("polling-indicator");
    await indicator.hover();

    const tooltip = page.getByTestId("polling-tooltip");
    await expect(tooltip).toBeVisible();

    const initialText = await tooltip.textContent();

    await page.waitForTimeout(1200);

    await expect(tooltip).toBeVisible();
    await expect.poll(async () => tooltip.textContent()).not.toBe(initialText);
  });

  test("toggles the theme with the space bar outside editable fields", async ({
    page,
  }) => {
    await page.goto("/");

    const getThemeMode = () =>
      page
        .locator("html")
        .evaluate((element) => element.getAttribute("data-theme-mode"));

    const initialThemeMode = await getThemeMode();

    await page.getByTestId("polling-indicator").focus();
    await page.keyboard.press("Space");

    await expect.poll(getThemeMode).not.toBe(initialThemeMode);

    const toggledThemeMode = await getThemeMode();
    const itemSlugInput = page.locator('input[name="itemSlug"]');

    await itemSlugInput.focus();
    await page.keyboard.press("Space");

    await expect.poll(getThemeMode).toBe(toggledThemeMode);
    await expect(itemSlugInput).toHaveValue(" ");
  });

  test("adds a rule immediately while the create request is still in flight", async ({
    page,
  }) => {
    const temporaryWorkspaceFailures: string[] = [];
    page.on("response", (response) => {
      if (
        response.url().includes("/api/workspace/temp-rule-") &&
        response.status() >= 400
      ) {
        temporaryWorkspaceFailures.push(
          `${response.status()} ${response.url()}`,
        );
      }
    });

    await page.route("**/api/watch-rules", async (route) => {
      const response = await route.fetch();
      await page.waitForTimeout(1200);
      await route.fulfill({ response });
    });

    await page.goto("/");

    const priceInput = page.locator('input[name="maxPlatinum"]');
    const submitBtn = page.locator('button[type="submit"]');
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/watch-rules") &&
        response.request().method() === "POST",
    );

    await selectItemByKeyboard(page, "arcane_barrier");
    await priceInput.fill("10");
    await submitBtn.click();

    await expect(page.getByTestId("watchlist-panel")).toContainText(
      "Arcane Barrier",
    );
    await expect(page.getByTestId(/rule-remove-/).first()).toBeVisible();
    await expect(page.getByTestId(/rule-remove-/).first()).toBeDisabled();
    await expect(submitBtn).toHaveAttribute(
      "aria-label",
      "Creating watch rule",
    );
    await createResponse;
    await expect(page.getByTestId(/rule-remove-/).first()).toBeVisible();
    await expect(page.getByTestId(/rule-remove-/).first()).toBeEnabled();
    expect(temporaryWorkspaceFailures).toEqual([]);
  });

  test("rolls back the temporary rule and shows the timeout message when create fails upstream", async ({
    page,
  }) => {
    await page.route("**/api/watch-rules", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          error: "Market data timed out upstream. Try again shortly.",
        }),
        contentType: "application/json",
        status: 503,
      });
    });

    await page.goto("/");

    await selectItemByKeyboard(page, "arcane_barrier");
    await page.locator('input[name="maxPlatinum"]').fill("10");
    await page.locator('button[type="submit"]').click();

    await expect(
      page.getByText("Market data timed out upstream. Try again shortly."),
    ).toBeVisible();
    await expect(page.getByTestId("watchlist-panel")).not.toContainText(
      "Arcane Barrier",
    );
    await expect(page.getByTestId(/rule-remove-/)).toHaveCount(0);
  });

  test("strips non-numeric threshold characters and omits the field when left blank", async ({
    page,
  }) => {
    let createPayload: Record<string, unknown> | undefined;
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/watch-rules") &&
        response.request().method() === "POST",
    );

    await page.route("**/api/watch-rules", async (route) => {
      createPayload = route.request().postDataJSON() as Record<string, unknown>;
      const response = await route.fetch();
      await route.fulfill({ response });
    });

    await page.goto("/");

    const priceInput = page.locator('input[name="maxPlatinum"]');
    const submitBtn = page.locator('button[type="submit"]');

    await selectItemByKeyboard(page, "arcane_barrier");
    await priceInput.fill("12abc");
    await expect(priceInput).toHaveValue("12");

    await priceInput.fill("");
    await expect(priceInput).toHaveValue("");

    await submitBtn.click();
    await createResponse;

    await expect(page.getByTestId("watchlist-panel")).toContainText(
      "Arcane Barrier",
    );
    expect(createPayload).toEqual({
      itemSlug: "arcane_barrier",
    });
  });

  test("uses numeric-only threshold input guards for create and inline edit fields", async ({
    page,
  }) => {
    await page.goto("/");

    const createPriceInput = page.locator('input[name="maxPlatinum"]');

    await expect(createPriceInput).toHaveAttribute("inputmode", "numeric");
    await expect(createPriceInput).toHaveAttribute("pattern", "[0-9]*");

    await selectItemByKeyboard(page, "arcane_barrier");
    await createPriceInput.fill("12abc$%34");
    await expect(createPriceInput).toHaveValue("1234");

    await page.locator('button[type="submit"]').click();
    await expect(page.getByTestId("watchlist-panel")).toContainText(
      "Arcane Barrier",
    );

    const editButton = page.getByTestId(/rule-threshold-edit-/).first();
    await editButton.click();

    const editPriceInput = page.getByTestId(/rule-threshold-input-/).first();
    await expect(editPriceInput).toHaveAttribute("inputmode", "numeric");
    await expect(editPriceInput).toHaveAttribute("pattern", "[0-9]*");

    await editPriceInput.fill("4z!2");
    await expect(editPriceInput).toHaveValue("42");
  });

  test("warms tracked rule workspaces so switching rules does not trigger a new fetch", async ({
    page,
    request,
  }) => {
    const firstRuleResponse = await request.post("/api/watch-rules", {
      data: {
        itemSlug: "arcane_barrier",
        maxPlatinum: 10,
      },
    });
    await expect(firstRuleResponse).toBeOK();
    const firstRule = (await firstRuleResponse.json()) as { id: string };

    const secondRuleResponse = await request.post("/api/watch-rules", {
      data: {
        itemSlug: "primed_continuity",
        maxPlatinum: 20,
      },
    });
    await expect(secondRuleResponse).toBeOK();
    const secondRule = (await secondRuleResponse.json()) as { id: string };

    const workspaceRequestCounts: Record<string, number> = {};

    await page.route("**/api/workspace/**", async (route) => {
      const ruleId = route.request().url().split("/").pop() ?? "unknown-rule";
      workspaceRequestCounts[ruleId] =
        (workspaceRequestCounts[ruleId] ?? 0) + 1;

      const itemSlug =
        ruleId === firstRule.id ? "arcane_barrier" : "primed_continuity";
      const maxPlatinum = ruleId === firstRule.id ? 10 : 20;

      await route.fulfill({
        body: JSON.stringify({
          marketTop: [
            {
              id: `order-${ruleId}`,
              itemId: `item-${ruleId}`,
              platinum: maxPlatinum - 1,
              quantity: 1,
              rank: 0,
              type: "sell",
              updatedAt: "2026-03-23T00:00:00.000Z",
              user: {
                id: `seller-${ruleId}`,
                ingameName: `seller_${itemSlug}`,
                lastSeen: "2026-03-23T00:00:00.000Z",
                slug: `seller_${itemSlug}`,
                status: "online",
              },
              visible: true,
            },
          ],
          offlineOrders: [],
          onlineOrders: [
            {
              id: `order-${ruleId}`,
              itemId: `item-${ruleId}`,
              platinum: maxPlatinum - 1,
              quantity: 1,
              rank: 0,
              type: "sell",
              updatedAt: "2026-03-23T00:00:00.000Z",
              user: {
                id: `seller-${ruleId}`,
                ingameName: `seller_${itemSlug}`,
                lastSeen: "2026-03-23T00:00:00.000Z",
                slug: `seller_${itemSlug}`,
                status: "online",
              },
              visible: true,
            },
          ],
          rule: {
            createdAt: "2026-03-23T00:00:00.000Z",
            crossplay: true,
            enabled: true,
            id: ruleId,
            itemSlug,
            maxPlatinum,
            platform: "pc",
            sortOrder: ruleId === firstRule.id ? 1 : 2,
            updatedAt: "2026-03-23T00:00:00.000Z",
            userId: "local-demo-user",
          },
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/");

    await expect
      .poll(() => ({
        first: workspaceRequestCounts[firstRule.id] ?? 0,
        second: workspaceRequestCounts[secondRule.id] ?? 0,
      }))
      .toEqual({ first: 1, second: 1 });

    await page
      .locator(`[data-testid="watchlist-rule-row-${secondRule.id}"]`)
      .click();

    await expect(page.getByTestId("market-panel")).toContainText(
      "Primed Continuity",
    );
    await expect
      .poll(() => ({
        first: workspaceRequestCounts[firstRule.id] ?? 0,
        second: workspaceRequestCounts[secondRule.id] ?? 0,
      }))
      .toEqual({ first: 1, second: 1 });
  });

  test("opens the selected tracked rule from a ruleId query parameter", async ({
    page,
    request,
  }) => {
    const firstRuleResponse = await request.post("/api/watch-rules", {
      data: {
        itemSlug: "arcane_barrier",
        maxPlatinum: 10,
      },
    });
    await expect(firstRuleResponse).toBeOK();
    const firstRule = (await firstRuleResponse.json()) as { id: string };

    const secondRuleResponse = await request.post("/api/watch-rules", {
      data: {
        itemSlug: "primed_continuity",
        maxPlatinum: 20,
      },
    });
    await expect(secondRuleResponse).toBeOK();
    const secondRule = (await secondRuleResponse.json()) as { id: string };

    const workspaceRequestCounts: Record<string, number> = {};

    await page.route("**/api/workspace/**", async (route) => {
      const ruleId = route.request().url().split("/").pop() ?? "unknown-rule";
      workspaceRequestCounts[ruleId] =
        (workspaceRequestCounts[ruleId] ?? 0) + 1;

      const itemSlug =
        ruleId === firstRule.id ? "arcane_barrier" : "primed_continuity";
      const maxPlatinum = ruleId === firstRule.id ? 10 : 20;

      await route.fulfill({
        body: JSON.stringify({
          marketTop: [],
          offlineOrders: [],
          onlineOrders: [],
          rule: {
            createdAt: "2026-03-23T00:00:00.000Z",
            crossplay: true,
            enabled: true,
            id: ruleId,
            itemSlug,
            maxPlatinum,
            platform: "pc",
            sortOrder: ruleId === firstRule.id ? 1 : 2,
            updatedAt: "2026-03-23T00:00:00.000Z",
            userId: "local-demo-user",
          },
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto(`/?ruleId=${secondRule.id}`);

    await expect(page.getByTestId("market-panel")).toContainText(
      "Primed Continuity",
    );
    await expect
      .poll(() => ({
        first: workspaceRequestCounts[firstRule.id] ?? 0,
        second: workspaceRequestCounts[secondRule.id] ?? 0,
      }))
      .toEqual({ first: 1, second: 1 });
  });

  test("reuses the cached selected workspace on reload before delayed refetches finish", async ({
    page,
    request,
  }) => {
    const firstRuleResponse = await request.post("/api/watch-rules", {
      data: {
        itemSlug: "arcane_barrier",
        maxPlatinum: 10,
      },
    });
    await expect(firstRuleResponse).toBeOK();
    const firstRule = (await firstRuleResponse.json()) as { id: string };

    const secondRuleResponse = await request.post("/api/watch-rules", {
      data: {
        itemSlug: "primed_continuity",
        maxPlatinum: 20,
      },
    });
    await expect(secondRuleResponse).toBeOK();
    await secondRuleResponse.json();

    let delayWorkspaceResponses = false;

    await page.route("**/api/workspace/**", async (route) => {
      const ruleId = route.request().url().split("/").pop() ?? "unknown-rule";

      if (delayWorkspaceResponses) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      const itemSlug =
        ruleId === firstRule.id ? "arcane_barrier" : "primed_continuity";
      const maxPlatinum = ruleId === firstRule.id ? 10 : 20;

      await route.fulfill({
        body: JSON.stringify({
          marketTop: [],
          offlineOrders: [],
          onlineOrders: [],
          rule: {
            createdAt: "2026-03-23T00:00:00.000Z",
            crossplay: true,
            enabled: true,
            id: ruleId,
            itemSlug,
            maxPlatinum,
            platform: "pc",
            sortOrder: ruleId === firstRule.id ? 1 : 2,
            updatedAt: "2026-03-23T00:00:00.000Z",
            userId: "local-demo-user",
          },
          setPricing: null,
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/");
    await page.getByText("Primed Continuity").click();
    await expect(page.getByTestId("market-panel")).toContainText(
      "Primed Continuity",
    );

    delayWorkspaceResponses = true;
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("market-panel")).toContainText(
      "Primed Continuity",
    );
    await expect(page.getByTestId("market-header-item-link")).toContainText(
      "Primed Continuity",
    );
  });

  test("does not flash the empty workspace state during a delayed hard reload", async ({
    page,
    request,
  }) => {
    const firstRuleResponse = await request.post("/api/watch-rules", {
      data: {
        itemSlug: "arcane_barrier",
        maxPlatinum: 10,
      },
    });
    await expect(firstRuleResponse).toBeOK();
    const firstRule = (await firstRuleResponse.json()) as { id: string };

    const secondRuleResponse = await request.post("/api/watch-rules", {
      data: {
        itemSlug: "primed_continuity",
        maxPlatinum: 20,
      },
    });
    await expect(secondRuleResponse).toBeOK();
    await secondRuleResponse.json();

    let delayWorkspaceResponses = false;

    await page.route("**/api/workspace/**", async (route) => {
      const ruleId = route.request().url().split("/").pop() ?? "unknown-rule";

      if (delayWorkspaceResponses) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      const itemSlug =
        ruleId === firstRule.id ? "arcane_barrier" : "primed_continuity";
      const maxPlatinum = ruleId === firstRule.id ? 10 : 20;

      await route.fulfill({
        body: JSON.stringify({
          marketTop: [],
          offlineOrders: [],
          onlineOrders: [],
          rule: {
            createdAt: "2026-03-23T00:00:00.000Z",
            crossplay: true,
            enabled: true,
            id: ruleId,
            itemSlug,
            maxPlatinum,
            platform: "pc",
            sortOrder: ruleId === firstRule.id ? 1 : 2,
            updatedAt: "2026-03-23T00:00:00.000Z",
            userId: "local-demo-user",
          },
          setPricing: null,
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/");
    await page.getByText("Primed Continuity").click();
    await expect(page.getByTestId("market-panel")).toContainText(
      "Primed Continuity",
    );

    await page.addInitScript(() => {
      const snapshots: string[] = [];
      const recordSnapshot = () => {
        const app = document.getElementById("app");

        if (!app || getComputedStyle(app).visibility === "hidden") {
          return;
        }

        const panel = document.querySelector("[data-testid='market-panel']");
        snapshots.push(panel?.textContent ?? "");
      };

      Object.defineProperty(window, "__wmtMarketPanelSnapshots", {
        configurable: true,
        value: snapshots,
      });

      document.addEventListener("DOMContentLoaded", () => {
        recordSnapshot();

        const observer = new MutationObserver(() => {
          recordSnapshot();
        });

        observer.observe(document.documentElement, {
          characterData: true,
          childList: true,
          subtree: true,
        });
        window.setTimeout(() => observer.disconnect(), 2500);
      });
    });

    delayWorkspaceResponses = true;
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("market-panel")).toContainText(
      "Primed Continuity",
    );
    await expect(page.getByTestId("market-header-item-link")).toContainText(
      "Primed Continuity",
    );

    const panelSnapshots = await page.evaluate(
      () =>
        (window as Window & { __wmtMarketPanelSnapshots?: string[] })
          .__wmtMarketPanelSnapshots ?? [],
    );

    expect(
      panelSnapshots.some((text) => text.includes("Select a tracked rule")),
    ).toBe(false);
    expect(
      panelSnapshots.some((text) => text.includes("No active watch rules")),
    ).toBe(false);
  });

  test("can collapse the rules and alerts sections", async ({ page }) => {
    await page.goto("/");

    const rulesToggle = page.getByTestId("watchlist-section-toggle");
    const alertsToggle = page.getByTestId("alerts-section-toggle");

    await expect(rulesToggle).toHaveAttribute("aria-expanded", "true");
    await expect(alertsToggle).toHaveAttribute("aria-expanded", "true");

    await rulesToggle.click();
    await alertsToggle.click();

    await expect(rulesToggle).toHaveAttribute("aria-expanded", "false");
    await expect(alertsToggle).toHaveAttribute("aria-expanded", "false");
  });

  test("keeps the docked sidebars at laptop widths", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/");

    await expect(page.getByTestId("dashboard-shell")).toBeVisible();
    await expect(page.getByTestId("panel-toggle-bar")).toBeHidden();
    await expect(page.getByTestId("watchlist-panel")).toBeVisible();
    await expect(page.getByTestId("market-panel")).toBeVisible();
    await expect(page.getByTestId("alerts-panel")).toBeVisible();
  });

  test("keeps the docked sidebars at tablet widths", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 844 });
    await page.goto("/");

    await expect(page.getByTestId("panel-toggle-bar")).toBeHidden();
    await expect(page.getByTestId("watchlist-panel")).toBeVisible();
    await expect(page.getByTestId("market-panel")).toBeVisible();
    await expect(page.getByTestId("alerts-panel")).toBeVisible();
    await expect(page.getByTestId("watchlist-pane-resize")).toBeVisible();
    await expect(page.getByTestId("alerts-pane-resize")).toBeVisible();
    await expect(
      page.getByTestId("watchlist-pane-resize").locator("span"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("alerts-pane-resize").locator("span"),
    ).toHaveCount(0);
  });

  test("desktop side panes can collapse and restore", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.addInitScript(() => {
      window.localStorage.setItem("wmt-layout-watchlist-width", "340");
      window.localStorage.setItem("wmt-layout-alerts-width", "320");
    });
    await page.goto("/");

    await expect(page.getByTestId("watchlist-panel")).toBeVisible();
    await expect(page.getByTestId("watchlist-pane-collapse")).toHaveCount(0);
    await expect(page.getByTestId("alerts-pane-collapse")).toHaveCount(0);

    const watchlistShellWidth = await page
      .getByTestId("watchlist-pane-shell")
      .evaluate((element) => element.getBoundingClientRect().width);
    const alertsShellWidth = await page
      .getByTestId("alerts-pane-shell")
      .evaluate((element) => element.getBoundingClientRect().width);
    expect(watchlistShellWidth).toBe(340);
    expect(alertsShellWidth).toBe(320);

    await page.getByTestId("watchlist-pane-header").click();
    await page.getByTestId("alerts-pane-header").click();
    await expect(page.getByTestId("watchlist-panel")).toBeHidden();
    await expect(page.getByTestId("alerts-panel")).toBeHidden();
    await expect(page.getByTestId("desktop-pane-restore-bar")).toBeVisible();
    const watchlistRailFootprintWidth = await page
      .getByTestId("watchlist-pane-rail")
      .evaluate((element) => element.getBoundingClientRect().width);
    const watchlistRailLineWidth = await page
      .getByTestId("watchlist-pane-expand-line")
      .evaluate((element) => element.getBoundingClientRect().width);
    expect(watchlistRailFootprintWidth).toBe(1);
    expect(watchlistRailLineWidth).toBe(1);
    await expect(page.getByTestId("watchlist-pane-rail-expand")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(
      page.getByTestId("watchlist-pane-rail-expand").locator("svg"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("watchlist-pane-rail-expand").locator("span"),
    ).toHaveCount(0);
    await expect(page.getByTestId("watchlist-pane-expand")).toContainText(
      "0 rules",
    );
    await expect(page.getByTestId("watchlist-pane-expand-icon")).toBeVisible();
    const watchlistIndicatorTop = await page
      .getByTestId("watchlist-pane-expand-icon")
      .evaluate((element) => element.getBoundingClientRect().top);
    const watchlistIndicatorBox = await page
      .getByTestId("watchlist-pane-expand-icon")
      .evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right };
      });
    const watchlistRestoreButtonWidth = await page
      .getByTestId("watchlist-pane-expand")
      .evaluate((element) => element.getBoundingClientRect().width);
    await expect(
      page.getByTestId("watchlist-pane-expand-icon").locator("span"),
    ).toHaveCount(3);
    const restoreBarTop = await page
      .getByTestId("desktop-pane-restore-bar")
      .evaluate((element) => element.getBoundingClientRect().top);
    expect(watchlistIndicatorTop - restoreBarTop).toBeLessThanOrEqual(12);
    expect(watchlistIndicatorBox.left).toBeGreaterThanOrEqual(0);
    expect(watchlistRestoreButtonWidth).toBe(watchlistShellWidth);

    const alertsRailFootprintWidth = await page
      .getByTestId("alerts-pane-rail")
      .evaluate((element) => element.getBoundingClientRect().width);
    const alertsRailLineWidth = await page
      .getByTestId("alerts-pane-expand-line")
      .evaluate((element) => element.getBoundingClientRect().width);
    expect(alertsRailFootprintWidth).toBe(1);
    expect(alertsRailLineWidth).toBe(1);
    await expect(page.getByTestId("alerts-pane-rail-expand")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(
      page.getByTestId("alerts-pane-rail-expand").locator("svg"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("alerts-pane-rail-expand").locator("span"),
    ).toHaveCount(0);
    await expect(page.getByTestId("alerts-pane-expand")).toContainText(
      "0 alerts",
    );
    await expect(page.getByTestId("alerts-pane-expand-icon")).toBeVisible();
    const alertsIndicatorTop = await page
      .getByTestId("alerts-pane-expand-icon")
      .evaluate((element) => element.getBoundingClientRect().top);
    const alertsIndicatorBox = await page
      .getByTestId("alerts-pane-expand-icon")
      .evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right };
      });
    const alertsRestoreButtonWidth = await page
      .getByTestId("alerts-pane-expand")
      .evaluate((element) => element.getBoundingClientRect().width);
    await expect(
      page.getByTestId("alerts-pane-expand-icon").locator("svg"),
    ).toHaveCount(1);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(alertsIndicatorTop - restoreBarTop).toBeLessThanOrEqual(12);
    expect(alertsIndicatorBox.right).toBeLessThanOrEqual(viewportWidth);
    expect(alertsRestoreButtonWidth).toBe(alertsShellWidth);

    const restoreCenterWidth = await page
      .getByTestId("desktop-pane-restore-center")
      .evaluate((element) => element.getBoundingClientRect().width);
    expect(restoreCenterWidth).toBeGreaterThan(600);

    await page.getByTestId("watchlist-pane-expand").click();
    await expect(page.getByTestId("watchlist-panel")).toBeVisible();
    await page.getByTestId("alerts-pane-expand").click();
    await expect(page.getByTestId("alerts-panel")).toBeVisible();
  });

  test("desktop side pane widths can be resized and survive reload", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/");

    const watchlistShell = page.getByTestId("watchlist-pane-shell");
    const resizeHandle = page.getByTestId("watchlist-pane-resize");
    const initialWidth = await watchlistShell.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    const handleBox = await resizeHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    await page.mouse.move(
      (handleBox?.x ?? 0) + (handleBox?.width ?? 0) / 2,
      (handleBox?.y ?? 0) + (handleBox?.height ?? 0) / 2,
    );
    await page.mouse.down();
    await page.mouse.move((handleBox?.x ?? 0) + 120, handleBox?.y ?? 0, {
      steps: 8,
    });
    await page.mouse.up();

    const resizedWidth = await watchlistShell.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    expect(resizedWidth).toBeGreaterThan(initialWidth + 40);

    await page.reload();
    await expect(page.getByTestId("watchlist-panel")).toBeVisible();
    const restoredWidth = await watchlistShell.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    expect(Math.abs(restoredWidth - resizedWidth)).toBeLessThanOrEqual(2);
  });

  test("collapsed desktop top bar widths can be resized and survive reload", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.addInitScript(() => {
      if (window.sessionStorage.getItem("wmt-collapsed-resize-seeded")) {
        return;
      }

      window.sessionStorage.setItem("wmt-collapsed-resize-seeded", "true");
      window.localStorage.setItem("wmt-layout-watchlist-width", "300");
      window.localStorage.setItem("wmt-layout-alerts-width", "300");
    });
    await page.goto("/");

    await page.getByTestId("watchlist-pane-header").click();
    await page.getByTestId("alerts-pane-header").click();
    await expect(page.getByTestId("desktop-pane-restore-bar")).toBeVisible();

    const watchlistRestore = page.getByTestId("watchlist-pane-expand");
    const alertsRestore = page.getByTestId("alerts-pane-expand");
    const watchlistTopResize = page.getByTestId("watchlist-pane-topbar-resize");
    const alertsTopResize = page.getByTestId("alerts-pane-topbar-resize");
    const initialWatchlistWidth = await watchlistRestore.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    const initialAlertsWidth = await alertsRestore.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    const watchHandleBox = await watchlistTopResize.boundingBox();
    const alertsHandleBox = await alertsTopResize.boundingBox();
    expect(watchHandleBox).not.toBeNull();
    expect(alertsHandleBox).not.toBeNull();

    await page.mouse.move(
      (watchHandleBox?.x ?? 0) + (watchHandleBox?.width ?? 0) / 2,
      (watchHandleBox?.y ?? 0) + (watchHandleBox?.height ?? 0) / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      (watchHandleBox?.x ?? 0) + 80,
      watchHandleBox?.y ?? 0,
      {
        steps: 8,
      },
    );
    await page.mouse.up();

    await page.mouse.move(
      (alertsHandleBox?.x ?? 0) + (alertsHandleBox?.width ?? 0) / 2,
      (alertsHandleBox?.y ?? 0) + (alertsHandleBox?.height ?? 0) / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      (alertsHandleBox?.x ?? 0) - 70,
      alertsHandleBox?.y ?? 0,
      {
        steps: 8,
      },
    );
    await page.mouse.up();

    const resizedWatchlistWidth = await watchlistRestore.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    const resizedAlertsWidth = await alertsRestore.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    expect(resizedWatchlistWidth).toBeGreaterThan(initialWatchlistWidth + 40);
    expect(resizedAlertsWidth).toBeGreaterThan(initialAlertsWidth + 30);

    await page.reload();
    await expect(page.getByTestId("desktop-pane-restore-bar")).toBeVisible();
    const restoredWatchlistWidth = await watchlistRestore.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    const restoredAlertsWidth = await alertsRestore.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    expect(
      Math.abs(restoredWatchlistWidth - resizedWatchlistWidth),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(restoredAlertsWidth - resizedAlertsWidth),
    ).toBeLessThanOrEqual(2);
  });

  test("phone layout keeps full-width drawers without resize handles", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.getByTestId("panel-toggle-bar")).toBeVisible();
    await expect(page.getByTestId("watchlist-pane-resize")).toHaveCount(0);
    await expect(page.getByTestId("alerts-pane-resize")).toHaveCount(0);

    await page.getByTestId("panel-toggle-rules").click();
    await expect(page.getByTestId("watchlist-panel")).toBeVisible();
    const drawerWidth = await page
      .getByTestId("watchlist-panel")
      .locator("xpath=ancestor::section[1]")
      .evaluate((element) => element.getBoundingClientRect().width);
    expect(drawerWidth).toBeGreaterThanOrEqual(360);
  });

  test("uses mobile panel toggles instead of permanently docked sidebars", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.getByTestId("panel-toggle-bar")).toBeVisible();
    await expect(page.getByTestId("watchlist-panel")).toBeHidden();
    await expect(page.getByTestId("alerts-panel")).toBeHidden();

    await page.getByTestId("panel-toggle-rules").click();
    await expect(page.getByTestId("watchlist-panel")).toBeVisible();
  });

  test("renders the delete confirmation dialog on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await page.getByTestId("panel-toggle-rules").click();
    await selectItemByKeyboard(page, "arcane_barrier");
    await page.locator('input[name="maxPlatinum"]').fill("10");
    await page.locator('button[type="submit"]').click();

    await expect(page.getByTestId("watchlist-panel")).toContainText(
      "Arcane Barrier",
    );
    await page
      .getByTestId(/rule-remove-/)
      .first()
      .click();

    await expect(page.getByTestId("confirm-dialog-panel")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  });
});
