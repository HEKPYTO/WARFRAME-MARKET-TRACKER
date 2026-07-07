import { z } from "zod";

const resetPayloadSchema = z.object({
  seed: z.enum(["empty", "demo"]).default("empty"),
});

export type ResetSeed = z.infer<typeof resetPayloadSchema>["seed"];

export function isDevResetEnabled(env: {
  APP_ENV?: string | undefined;
  ENABLE_DEV_RESET?: string | undefined;
}): boolean {
  return env.ENABLE_DEV_RESET === "true" && env.APP_ENV === "test";
}

export function parseResetPayload(input: unknown): {
  seed: ResetSeed;
} {
  return resetPayloadSchema.parse(input ?? {});
}
