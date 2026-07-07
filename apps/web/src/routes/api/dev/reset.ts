import {
  listDashboardSnapshot,
  resetDemoState,
} from "@warframe-market-tracker/db";

import { isDevResetEnabled, parseResetPayload } from "~/lib/dev-reset";

export async function POST(event: { request: Request }) {
  if (
    !isDevResetEnabled({
      APP_ENV: process.env.APP_ENV,
      ENABLE_DEV_RESET: process.env.ENABLE_DEV_RESET,
    })
  ) {
    return new Response("Not found", {
      status: 404,
    });
  }

  let body: unknown;
  const contentLength = event.request.headers.get("content-length");

  if (contentLength === null || contentLength === "0") {
    body = undefined;
  } else {
    try {
      body = await event.request.json();
    } catch {
      return new Response("Malformed JSON body", {
        status: 400,
      });
    }
  }

  const payload = parseResetPayload(body);
  await resetDemoState(payload.seed);

  return Response.json(await listDashboardSnapshot());
}
