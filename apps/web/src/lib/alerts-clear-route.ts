export function createClearAlertsHandler(deps: {
  clearAlerts: () => Promise<void>;
}) {
  return async function DELETE() {
    await deps.clearAlerts();
    return new Response(null, { status: 204 });
  };
}
