import { deleteWatchRule, updateWatchRule } from "@warframe-market-tracker/db";
import { z } from "zod";

const patchWatchRuleSchema = z
  .object({
    enabled: z.boolean().optional(),
    maxPlatinum: z.number().int().nonnegative().optional(),
  })
  .refine(
    (value) => value.enabled !== undefined || value.maxPlatinum !== undefined,
    "At least one watch rule field must be provided",
  );

export async function PATCH(event: {
  params: { id?: string };
  request: Request;
}) {
  const ruleId = event.params.id;

  if (!ruleId) {
    return Response.json(
      {
        error: "Missing rule id",
      },
      { status: 400 },
    );
  }

  const body = patchWatchRuleSchema.parse(await event.request.json());
  const payload: {
    enabled?: boolean;
    maxPlatinum?: number;
  } = {};

  if (body.enabled !== undefined) {
    payload.enabled = body.enabled;
  }

  if (body.maxPlatinum !== undefined) {
    payload.maxPlatinum = body.maxPlatinum;
  }

  await updateWatchRule(ruleId, payload);

  return new Response(null, { status: 204 });
}

export async function DELETE(event: { params: { id?: string } }) {
  const ruleId = event.params.id;

  if (!ruleId) {
    return Response.json(
      {
        error: "Missing rule id",
      },
      { status: 400 },
    );
  }

  await deleteWatchRule(ruleId);

  return new Response(null, { status: 204 });
}
