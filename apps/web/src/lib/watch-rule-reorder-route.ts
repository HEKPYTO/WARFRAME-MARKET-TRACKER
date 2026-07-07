import { z } from "zod";

const reorderWatchRulesSchema = z.object({
  ruleIds: z.array(z.string().min(1)).min(1),
});

export function createWatchRuleReorderHandler(deps: {
  listRuleIds: () => Promise<string[]>;
  reorderRuleIds: (ruleIds: string[]) => Promise<void>;
}) {
  return async (event: { request: Request }) => {
    const body = reorderWatchRulesSchema.parse(await event.request.json());
    const currentRuleIds = await deps.listRuleIds();
    const submittedRuleIds = body.ruleIds;
    const currentRuleIdSet = new Set(currentRuleIds);
    const submittedRuleIdSet = new Set(submittedRuleIds);
    const hasExactMembership =
      submittedRuleIds.length === currentRuleIds.length &&
      submittedRuleIdSet.size === currentRuleIds.length &&
      currentRuleIds.every((ruleId) => submittedRuleIdSet.has(ruleId));

    if (
      !hasExactMembership ||
      submittedRuleIds.some((ruleId) => !currentRuleIdSet.has(ruleId))
    ) {
      return Response.json(
        {
          error:
            "Submitted rule order must include every tracked rule exactly once",
        },
        { status: 400 },
      );
    }

    await deps.reorderRuleIds(submittedRuleIds);

    return new Response(null, { status: 204 });
  };
}
