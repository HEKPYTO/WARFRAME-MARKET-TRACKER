import type { DashboardResponse, WorkspaceResponse } from "./api";

export interface WorkspaceSummary {
  lowestVisiblePrice: number | null;
  offlineCount: number;
  onlineCount: number;
  polledItems: number;
  trackedItems: number;
  unreadAlerts: number;
}

export function countPolledItems(
  dashboard: DashboardResponse | null | undefined,
): number {
  return new Set(
    (dashboard?.rules ?? [])
      .filter((rule) => rule.enabled)
      .map((rule) => rule.itemSlug),
  ).size;
}

export function resolveSelectedRuleId(
  selectedRuleId: string | undefined,
  dashboard: DashboardResponse | null | undefined,
): string | undefined {
  const rules = dashboard?.rules ?? [];

  if (selectedRuleId && rules.some((rule) => rule.id === selectedRuleId)) {
    return selectedRuleId;
  }

  return rules.at(0)?.id;
}

export function createWorkspaceSummary(
  dashboard: DashboardResponse | undefined,
  workspace: WorkspaceResponse | null | undefined,
): WorkspaceSummary {
  return {
    lowestVisiblePrice: workspace?.marketTop.at(0)?.platinum ?? null,
    offlineCount: workspace?.offlineOrders.length ?? 0,
    onlineCount: workspace?.onlineOrders.length ?? 0,
    polledItems: countPolledItems(dashboard),
    trackedItems: dashboard?.rules.length ?? 0,
    unreadAlerts:
      dashboard?.alerts.filter((alert) => alert.readAt === null).length ?? 0,
  };
}
