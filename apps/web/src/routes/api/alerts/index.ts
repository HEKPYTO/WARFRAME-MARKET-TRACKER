import { clearAlertsForUser } from "@warframe-market-tracker/db";

import { createClearAlertsHandler } from "~/lib/alerts-clear-route";

export const DELETE = createClearAlertsHandler({
  clearAlerts: clearAlertsForUser,
});
