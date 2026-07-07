import { getRuntimeConfig } from "@warframe-market-tracker/market-client";
import {
  getUserSettingsState,
  listDashboardSnapshot,
} from "@warframe-market-tracker/db";
import {
  fetchWorkerHealth,
  WORKER_HEALTH_PROBE_TIMEOUT_MS,
} from "~/lib/worker-health";
import { createDashboardHandler } from "~/lib/dashboard-route";

export const GET = createDashboardHandler({
  getUserSettingsState,
  getWorkerHealth: () =>
    fetchWorkerHealth({
      timeoutMs: WORKER_HEALTH_PROBE_TIMEOUT_MS,
    }),
  listDashboardSnapshot,
  runtimeConfig: getRuntimeConfig(process.env),
});
