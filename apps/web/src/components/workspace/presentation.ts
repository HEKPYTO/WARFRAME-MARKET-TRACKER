export function getWatchlistSubmitPresentation(submitting: boolean) {
  if (submitting) {
    return {
      ariaLabel: "Creating watch rule",
      label: "+",
      labelClassName: "text-[color:var(--theme-accent-gold-foreground)]",
      title: "Creating watch rule",
    };
  }

  return {
    ariaLabel: "Create watch rule",
    label: "+",
    labelClassName: "text-[color:var(--theme-accent-gold-foreground)]",
    title: "Create watch rule",
  };
}

export function getMarketPaneEmptyState(ruleCount: number) {
  if (ruleCount === 0) {
    return {
      body: "Create a watch rule from the left panel to start tracking live market orders.",
      title: "No active watch rules",
    };
  }

  return {
    body: "Select a tracked rule from the watchlist to inspect live market data.",
    title: "Select a tracked rule",
  };
}

export function getMarketPriceWarning(
  threshold: number,
  lowestMarketPrice: number | null,
) {
  if (lowestMarketPrice === null || threshold >= lowestMarketPrice) {
    return null;
  }

  return "Your target is below the current market floor.";
}

export function getAlertsEmptyState(ruleCount: number) {
  if (ruleCount === 0) {
    return {
      body: "Create a watch rule to arm alerts for price drops and seller status changes.",
      title: "No watch rules yet",
    };
  }

  return {
    body: "Monitoring is active. Alerts will appear when sellers meet your thresholds.",
    title: "Monitoring active",
  };
}
