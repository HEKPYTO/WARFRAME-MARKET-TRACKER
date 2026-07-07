import { describe, expect, it } from "bun:test";

import { createDebouncedTask } from "./debounced-task";

describe("createDebouncedTask", () => {
  it("runs only the latest scheduled task after the debounce delay", () => {
    const calls: string[] = [];
    const timers = new Map<number, () => void>();
    let nextTimerId = 0;
    const debouncedTask = createDebouncedTask<[string]>({
      clearTimeout: (timerId) => {
        timers.delete(timerId as number);
      },
      delayMs: 75,
      run: (value) => {
        calls.push(value);
      },
      setTimeout: (callback: () => void) => {
        const timerId = nextTimerId++;
        timers.set(timerId, callback);
        return timerId;
      },
    });

    debouncedTask.schedule("first");
    debouncedTask.schedule("second");

    expect(calls).toEqual([]);
    expect(timers.size).toBe(1);

    timers.values().next().value?.();

    expect(calls).toEqual(["second"]);
  });

  it("cancels pending work on dispose", () => {
    const calls: string[] = [];
    const timers = new Map<number, () => void>();
    let nextTimerId = 0;
    const debouncedTask = createDebouncedTask<[string]>({
      clearTimeout: (timerId) => {
        timers.delete(timerId as number);
      },
      delayMs: 75,
      run: (value) => {
        calls.push(value);
      },
      setTimeout: (callback: () => void) => {
        const timerId = nextTimerId++;
        timers.set(timerId, callback);
        return timerId;
      },
    });

    debouncedTask.schedule("first");
    debouncedTask.dispose();

    expect(timers.size).toBe(0);
    expect(calls).toEqual([]);
  });
});
