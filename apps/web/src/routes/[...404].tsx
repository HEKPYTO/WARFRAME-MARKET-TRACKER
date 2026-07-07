import { Title } from "@solidjs/meta";
import { setResponseStatus } from "@solidjs/start/http";
import { isServer } from "solid-js/web";

export default function NotFound() {
  if (isServer) {
    setResponseStatus(404);
  }

  return (
    <main
      class="relative flex min-h-screen overflow-hidden bg-app text-text-primary"
      data-testid="not-found-page"
    >
      <Title>Page Missing</Title>

      <div class="pointer-events-none absolute inset-0">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(101,213,203,0.08),_transparent_34%),radial-gradient(circle_at_82%_12%,_rgba(197,168,105,0.08),_transparent_24%),linear-gradient(180deg,_rgba(17,20,26,0.48),_transparent_38%)]" />
        <div class="absolute inset-y-0 left-[12%] w-px bg-[linear-gradient(180deg,transparent,rgba(197,168,105,0.16),transparent)]" />
        <div class="absolute inset-y-0 right-[12%] w-px bg-[linear-gradient(180deg,transparent,rgba(197,168,105,0.1),transparent)]" />
        <div class="absolute inset-x-0 top-[18%] h-px bg-[linear-gradient(90deg,transparent,rgba(197,168,105,0.12),transparent)]" />
      </div>

      <section class="relative flex min-h-screen w-full items-center justify-center px-6 py-10 sm:px-10">
        <div class="w-full max-w-3xl overflow-hidden border border-border-strong bg-panel/94 shadow-[0_24px_80px_rgba(2,6,23,0.42)]">
          <div class="flex items-center justify-between gap-3 border-b border-border px-6 py-4 font-mono text-[11px] uppercase tracking-[0.24em] text-text-muted sm:px-8">
            <span>Page status</span>
            <span data-testid="not-found-status">404</span>
          </div>

          <div class="grid gap-8 px-6 py-8 sm:px-8 sm:py-10">
            <div class="space-y-4">
              <p class="font-mono text-[11px] uppercase tracking-[0.28em] text-accent-teal">
                Request failed
              </p>
              <h1 class="text-4xl font-semibold tracking-[-0.04em] text-text-primary sm:text-5xl">
                Page Missing
              </h1>
              <p class="max-w-2xl text-base leading-7 text-text-secondary sm:text-lg">
                The page you requested could not be found. It may have moved,
                expired, or never existed in the first place.
              </p>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="border border-border bg-editor/80 px-4 py-4">
                <p class="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
                  Suggested path
                </p>
                <p class="mt-2 text-sm leading-6 text-text-secondary">
                  Return to the main dashboard to continue from a known entry
                  point.
                </p>
              </div>
              <div class="border border-border bg-editor/80 px-4 py-4">
                <p class="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
                  Quick recovery
                </p>
                <p class="mt-2 text-sm leading-6 text-text-secondary">
                  If you arrived here by mistake, go back to the previous page
                  and try a different route.
                </p>
              </div>
            </div>

            <div class="flex flex-wrap gap-3">
              <a
                class="inline-flex items-center justify-center gap-2 rounded-sm border border-border-strong bg-accent-gold px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-wide text-black transition-colors hover:bg-[#d4b97a]"
                data-testid="not-found-home"
                href="/"
              >
                Go Home
              </a>
              <button
                class="inline-flex items-center justify-center gap-2 rounded-sm border border-border bg-surface px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-wide text-text-primary transition-colors hover:bg-hover"
                data-testid="not-found-back"
                onClick={() => {
                  if (typeof window === "undefined") {
                    return;
                  }

                  if (window.history.length > 1) {
                    window.history.back();
                    return;
                  }

                  window.location.assign("/");
                }}
                type="button"
              >
                Go Back
              </button>
            </div>
          </div>

          <footer class="border-t border-border bg-editor/70 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted sm:px-8">
            Try a valid route or return home
          </footer>
        </div>
      </section>
    </main>
  );
}
