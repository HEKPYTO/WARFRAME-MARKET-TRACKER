import { createMemo, Show } from "solid-js";
import { useDashboard } from "~/store/dashboard";
import { getWorkerHealthToastPresentation } from "./worker-health-toast";
import {
  WORKER_HEALTH_TOAST_BODY_CLASS,
  WORKER_HEALTH_TOAST_CONTAINER_CLASS,
  WORKER_HEALTH_TOAST_LABEL_CLASS,
} from "./worker-health-toast-styles";

export function WorkerHealthToast() {
  const {
    hasPendingRuleCreation,
    refreshError,
    refreshState,
    runtimeConfig,
    workspaceSummary,
  } = useDashboard();
  const presentation = createMemo(() =>
    getWorkerHealthToastPresentation({
      hasPendingRuleCreation: hasPendingRuleCreation(),
      refreshError: refreshError(),
      refreshState: refreshState(),
      trackedItems: workspaceSummary().trackedItems,
      trackingPaused: runtimeConfig().trackingPaused,
      workerHealthState: runtimeConfig().workerHealthState,
    }),
  );

  return (
    <Show when={presentation().visible}>
      <div
        class={WORKER_HEALTH_TOAST_CONTAINER_CLASS}
        data-testid="worker-health-toast"
        role="alert"
      >
        <div class={WORKER_HEALTH_TOAST_LABEL_CLASS}>Warning</div>
        <div class={WORKER_HEALTH_TOAST_BODY_CLASS}>
          {presentation().message}
        </div>
      </div>
    </Show>
  );
}
