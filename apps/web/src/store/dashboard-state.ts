import type { AlertRecord, WatchRuleRecord } from "@warframe-market-tracker/db";

import type { DashboardResponse } from "~/lib/api";

export interface DashboardSlices {
  alertIds: string[];
  alertsById: Record<string, AlertRecord>;
  ruleIds: string[];
  rulesById: Record<string, WatchRuleRecord>;
}

export function createDashboardSlices(
  snapshot: DashboardResponse,
): DashboardSlices {
  return {
    alertIds: snapshot.alerts.map((alert) => alert.id),
    alertsById: Object.fromEntries(
      snapshot.alerts.map((alert) => [alert.id, alert]),
    ),
    ruleIds: snapshot.rules.map((rule) => rule.id),
    rulesById: Object.fromEntries(
      snapshot.rules.map((rule) => [rule.id, rule]),
    ),
  };
}

export function upsertRuleInSlices(
  slices: DashboardSlices,
  rule: WatchRuleRecord,
): DashboardSlices {
  const nextRuleIds = slices.ruleIds.includes(rule.id)
    ? slices.ruleIds
    : [...slices.ruleIds, rule.id];

  return {
    ...slices,
    ruleIds: nextRuleIds,
    rulesById: {
      ...slices.rulesById,
      [rule.id]: rule,
    },
  };
}

export function replaceRuleInSlices(
  slices: DashboardSlices,
  previousRuleId: string,
  rule: WatchRuleRecord,
): DashboardSlices {
  const { [previousRuleId]: _removed, ...remainingRules } = slices.rulesById;

  return {
    ...slices,
    ruleIds: slices.ruleIds.map((ruleId) =>
      ruleId === previousRuleId ? rule.id : ruleId,
    ),
    rulesById: {
      ...remainingRules,
      [rule.id]: rule,
    },
  };
}

export function removeRuleFromSlices(
  slices: DashboardSlices,
  ruleId: string,
): DashboardSlices {
  const { [ruleId]: _removed, ...remainingRules } = slices.rulesById;
  const nextAlertIds = slices.alertIds.filter(
    (alertId) => slices.alertsById[alertId]?.ruleId !== ruleId,
  );
  const remainingAlerts = Object.fromEntries(
    nextAlertIds
      .map((alertId) => [alertId, slices.alertsById[alertId]])
      .filter(
        (entry): entry is [string, AlertRecord] => entry[1] !== undefined,
      ),
  );

  return {
    ...slices,
    alertIds: nextAlertIds,
    alertsById: remainingAlerts,
    ruleIds: slices.ruleIds.filter((currentRuleId) => currentRuleId !== ruleId),
    rulesById: remainingRules,
  };
}

export function setRuleEnabledInSlices(
  slices: DashboardSlices,
  ruleId: string,
  enabled: boolean,
): DashboardSlices {
  const rule = slices.rulesById[ruleId];

  if (!rule) {
    return slices;
  }

  return {
    ...slices,
    rulesById: {
      ...slices.rulesById,
      [ruleId]: {
        ...rule,
        enabled,
      },
    },
  };
}

export function updateRuleInSlices(
  slices: DashboardSlices,
  ruleId: string,
  updates: {
    enabled?: boolean;
    maxPlatinum?: number;
  },
): DashboardSlices {
  const rule = slices.rulesById[ruleId];

  if (!rule) {
    return slices;
  }

  return {
    ...slices,
    rulesById: {
      ...slices.rulesById,
      [ruleId]: {
        ...rule,
        ...updates,
      },
    },
  };
}

export function reorderRulesInSlices(
  slices: DashboardSlices,
  ruleIds: string[],
): DashboardSlices {
  return {
    ...slices,
    ruleIds,
  };
}

export function removeAlertFromSlices(
  slices: DashboardSlices,
  alertId: string,
): DashboardSlices {
  const { [alertId]: _removed, ...remainingAlerts } = slices.alertsById;

  return {
    ...slices,
    alertIds: slices.alertIds.filter(
      (currentAlertId) => currentAlertId !== alertId,
    ),
    alertsById: remainingAlerts,
  };
}
