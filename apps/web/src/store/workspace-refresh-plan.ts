import type { WorkspaceResponse } from "~/lib/api";

export function getMissingWorkspaceRuleIds(input: {
  ruleIds: string[];
  workspaceByRuleId: Record<string, WorkspaceResponse>;
}) {
  return input.ruleIds.filter(
    (ruleId) => input.workspaceByRuleId[ruleId] === undefined,
  );
}

export function getWorkspaceRefreshPlan(input: {
  maxBackgroundRuleIds?: number;
  preferredRuleId: string | undefined;
  ruleIds: string[];
  workspaceByRuleId: Record<string, WorkspaceResponse>;
}) {
  const primaryRuleId =
    input.preferredRuleId && input.ruleIds.includes(input.preferredRuleId)
      ? input.preferredRuleId
      : input.ruleIds.at(0);

  return {
    backgroundRuleIds: getMissingWorkspaceRuleIds(input)
      .filter((ruleId) => ruleId !== primaryRuleId)
      .slice(
        0,
        typeof input.maxBackgroundRuleIds === "number" &&
          Number.isFinite(input.maxBackgroundRuleIds) &&
          input.maxBackgroundRuleIds >= 0
          ? input.maxBackgroundRuleIds
          : undefined,
      ),
    primaryRuleId,
  };
}
