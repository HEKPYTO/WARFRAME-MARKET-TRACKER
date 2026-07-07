export function createDebouncedTask<TArgs extends unknown[]>(input: {
  clearTimeout?: (timeoutId: unknown) => void;
  delayMs: number;
  run: (...args: TArgs) => void | Promise<void>;
  setTimeout?: (callback: () => void, delayMs: number) => unknown;
}) {
  let timeoutId: unknown = null;
  let pendingArgs: TArgs | null = null;
  const scheduleTimeout =
    input.setTimeout ??
    ((callback: () => void, delayMs: number) =>
      globalThis.setTimeout(callback, delayMs));
  const cancelTimeout =
    input.clearTimeout ??
    ((scheduledTimeoutId: unknown) =>
      globalThis.clearTimeout(
        scheduledTimeoutId as ReturnType<typeof globalThis.setTimeout>,
      ));

  function flush() {
    const args = pendingArgs;
    pendingArgs = null;

    if (!args) {
      return;
    }

    void input.run(...args);
  }

  return {
    dispose() {
      if (timeoutId !== null) {
        cancelTimeout(timeoutId);
        timeoutId = null;
      }

      pendingArgs = null;
    },
    flush,
    schedule(...args: TArgs) {
      pendingArgs = args;

      if (timeoutId !== null) {
        cancelTimeout(timeoutId);
      }

      timeoutId = scheduleTimeout(() => {
        timeoutId = null;
        flush();
      }, input.delayMs);
    },
  };
}
