import { describe, expect, it } from "bun:test";

import { getWorkerHealthToastPresentation } from "./worker-health-toast";
import {
  WORKER_HEALTH_TOAST_BODY_CLASS,
  WORKER_HEALTH_TOAST_CONTAINER_CLASS,
  WORKER_HEALTH_TOAST_LABEL_CLASS,
} from "./worker-health-toast-styles";

describe("getWorkerHealthToastPresentation", () => {
  it("stays hidden when the worker is healthy", () => {
    expect(
      getWorkerHealthToastPresentation({
        hasPendingRuleCreation: false,
        refreshError: undefined,
        refreshState: "idle",
        trackedItems: 4,
        trackingPaused: false,
        workerHealthState: "healthy",
      }),
    ).toEqual({
      message: null,
      visible: false,
    });
  });

  it("shows a warning toast when worker health is unavailable", () => {
    expect(
      getWorkerHealthToastPresentation({
        hasPendingRuleCreation: false,
        refreshError: undefined,
        refreshState: "idle",
        trackedItems: 4,
        trackingPaused: false,
        workerHealthState: "unhealthy",
      }),
    ).toEqual({
      message: "Worker health check failing. Alerts may be delayed.",
      visible: true,
    });
  });

  it("shows a warning toast when the worker is stale", () => {
    expect(
      getWorkerHealthToastPresentation({
        hasPendingRuleCreation: false,
        refreshError: undefined,
        refreshState: "idle",
        trackedItems: 4,
        trackingPaused: false,
        workerHealthState: "stale",
      }),
    ).toEqual({
      message: "Worker activity looks stale. Alerts may be delayed.",
      visible: true,
    });
  });

  it("suppresses the toast while tracking is paused", () => {
    expect(
      getWorkerHealthToastPresentation({
        hasPendingRuleCreation: false,
        refreshError: undefined,
        refreshState: "idle",
        trackedItems: 4,
        trackingPaused: true,
        workerHealthState: "unhealthy",
      }),
    ).toEqual({
      message: null,
      visible: false,
    });
  });

  it("suppresses the toast when there are no tracked items yet", () => {
    expect(
      getWorkerHealthToastPresentation({
        hasPendingRuleCreation: false,
        refreshError: undefined,
        refreshState: "idle",
        trackedItems: 0,
        trackingPaused: false,
        workerHealthState: "unhealthy",
      }),
    ).toEqual({
      message: null,
      visible: false,
    });
  });

  it("keeps the toast hidden when the server reports worker health as unknown", () => {
    expect(
      getWorkerHealthToastPresentation({
        hasPendingRuleCreation: false,
        refreshError: undefined,
        refreshState: "idle",
        trackedItems: 4,
        trackingPaused: false,
        workerHealthState: "unknown",
      }),
    ).toEqual({
      message: null,
      visible: false,
    });
  });

  it("shows a database warning toast when dashboard refresh reports the database is unavailable", () => {
    expect(
      getWorkerHealthToastPresentation({
        hasPendingRuleCreation: false,
        refreshError: "Database unavailable",
        refreshState: "error",
        trackedItems: 0,
        trackingPaused: false,
        workerHealthState: "healthy",
      }),
    ).toEqual({
      message: "Database unavailable. Dashboard may be stale.",
      visible: true,
    });
  });

  it("prioritizes a database warning over worker health noise", () => {
    expect(
      getWorkerHealthToastPresentation({
        hasPendingRuleCreation: false,
        refreshError: "Database unavailable",
        refreshState: "error",
        trackedItems: 4,
        trackingPaused: false,
        workerHealthState: "unhealthy",
      }),
    ).toEqual({
      message: "Database unavailable. Dashboard may be stale.",
      visible: true,
    });
  });

  it("suppresses worker warnings while a new rule is still being created", () => {
    expect(
      getWorkerHealthToastPresentation({
        hasPendingRuleCreation: true,
        refreshError: undefined,
        refreshState: "idle",
        trackedItems: 5,
        trackingPaused: false,
        workerHealthState: "stale",
      }),
    ).toEqual({
      message: null,
      visible: false,
    });
  });
});

describe("worker health toast styles", () => {
  it("uses a dedicated high-contrast surface without a drop shadow", () => {
    expect(WORKER_HEALTH_TOAST_CONTAINER_CLASS).toContain("absolute");
    expect(WORKER_HEALTH_TOAST_CONTAINER_CLASS).toContain(
      "bottom-[calc(100%+0.5rem)]",
    );
    expect(WORKER_HEALTH_TOAST_CONTAINER_CLASS).toContain(
      "bg-[color:var(--worker-health-toast-bg)]",
    );
    expect(WORKER_HEALTH_TOAST_CONTAINER_CLASS).toContain(
      "border-[color:var(--worker-health-toast-border)]",
    );
    expect(WORKER_HEALTH_TOAST_CONTAINER_CLASS).not.toContain("fixed");
    expect(WORKER_HEALTH_TOAST_CONTAINER_CLASS).not.toContain("shadow-");
  });

  it("uses theme tokens for both label and body text", () => {
    expect(WORKER_HEALTH_TOAST_LABEL_CLASS).toContain(
      "text-[color:var(--worker-health-toast-label)]",
    );
    expect(WORKER_HEALTH_TOAST_BODY_CLASS).toContain(
      "text-[color:var(--worker-health-toast-text)]",
    );
  });
});
