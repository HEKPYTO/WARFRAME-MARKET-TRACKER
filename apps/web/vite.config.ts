import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { nitroV2Plugin as nitro } from "@solidjs/vite-plugin-nitro-2";
import { solidStart } from "@solidjs/start/config";
import { fileURLToPath } from "node:url";

const resolveFromRoot = (path: string) =>
  fileURLToPath(new URL(`../../${path}`, import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), solidStart(), nitro()],
  resolve: {
    alias: {
      "@warframe-market-tracker/alert-engine": resolveFromRoot(
        "packages/alert-engine/src/index.ts",
      ),
      "@warframe-market-tracker/db": resolveFromRoot(
        "packages/db/src/index.ts",
      ),
      "@warframe-market-tracker/discord-alerts": resolveFromRoot(
        "packages/discord-alerts/src/index.ts",
      ),
      "@warframe-market-tracker/discord-client": resolveFromRoot(
        "packages/discord-client/src/index.ts",
      ),
      "@warframe-market-tracker/market-client": resolveFromRoot(
        "packages/market-client/src/index.ts",
      ),
      "@warframe-market-tracker/worker-health": resolveFromRoot(
        "packages/worker-health/src/index.ts",
      ),
    },
  },
});
