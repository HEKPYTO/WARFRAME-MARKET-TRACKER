import type { WatchAlert } from "@warframe-market-tracker/alert-engine";

export function buildAlertNotificationFingerprint(alert: WatchAlert): string {
  return `${alert.itemSlug}::${alert.sellerId}::${alert.platinum}::${alert.lastSeen}`;
}

export function dedupeAlertNotifications(alerts: WatchAlert[]): WatchAlert[] {
  const fingerprints = new Set<string>();
  const dedupedAlerts: WatchAlert[] = [];

  for (const alert of alerts) {
    const fingerprint = buildAlertNotificationFingerprint(alert);

    if (fingerprints.has(fingerprint)) {
      continue;
    }

    fingerprints.add(fingerprint);
    dedupedAlerts.push(alert);
  }

  return dedupedAlerts;
}
