import { query } from "@solidjs/router";

import { fetchSettings } from "./api";

export const getSettingsQuery = query(async () => fetchSettings(), "settings");
