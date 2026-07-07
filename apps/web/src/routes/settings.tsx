import { Title } from "@solidjs/meta";
import { A, createAsync, query, revalidate } from "@solidjs/router";
import { Icon } from "solid-heroicons";
import {
  check,
  chevronLeft,
  chevronRight,
  cog,
  exclamationTriangle,
  xMark,
} from "solid-heroicons/outline";
import { createSignal, Show } from "solid-js";

import { AppShell } from "~/components/layout";
import { DashboardShell } from "~/components/shell/DashboardShell";
import { Button, Input, ToggleSwitch } from "~/components/ui";
import { sendDiscordSettingsTest, updateSettings } from "~/lib/api";
import { MASKED_DISCORD_BOT_TOKEN } from "~/lib/settings-contract";
import { getSettingsQuery } from "~/lib/settings-query";
import { DashboardProvider } from "~/store/dashboard";

const SETTINGS_TAB_BUTTON_CLASS =
  "group flex h-9 items-center gap-2 border-r border-border bg-editor px-3 text-left text-[12px] text-text-primary transition-colors focus-visible:outline-none";
const SETTINGS_TAB_CLOSE_CLASS =
  "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-text-muted transition-none hover:bg-hover hover:text-text-primary focus-visible:bg-hover focus-visible:text-text-primary focus-visible:outline-none";

type SaveState = "idle" | "saved" | "error";
type TestState = "idle" | "ok" | "error";

export default function Settings() {
  const settingsResource = createAsync(() => getSettingsQuery(), {
    deferStream: true,
  });
  const [botTokenDraft, setBotTokenDraft] = createSignal<string | undefined>(
    undefined,
  );
  const [channelIdDraft, setChannelIdDraft] = createSignal<string | undefined>(
    undefined,
  );
  const [discordEnabledDraft, setDiscordEnabledDraft] = createSignal<
    boolean | undefined
  >(undefined);
  const [isSaving, setIsSaving] = createSignal(false);
  const [saveState, setSaveState] = createSignal<SaveState>("idle");
  const [saveErrorMessage, setSaveErrorMessage] = createSignal<string | null>(
    null,
  );
  const [isDiscordTesting, setIsDiscordTesting] = createSignal(false);
  const [discordTestState, setDiscordTestState] =
    createSignal<TestState>("idle");
  const [discordTestErrorMessage, setDiscordTestErrorMessage] = createSignal<
    string | null
  >(null);
  function invalidateDiscordTestState() {
    setDiscordTestState("idle");
    setDiscordTestErrorMessage(null);
  }

  function handleBotTokenInput(value: string) {
    setSaveErrorMessage(null);
    invalidateDiscordTestState();
    setBotTokenDraft(value);
  }

  function handleChannelIdInput(value: string) {
    setSaveErrorMessage(null);
    invalidateDiscordTestState();
    setChannelIdDraft(value);
  }

  function handleDiscordToggleChange(checked: boolean) {
    setSaveErrorMessage(null);
    invalidateDiscordTestState();
    setDiscordEnabledDraft(checked);
  }

  function resetDrafts() {
    setBotTokenDraft(undefined);
    setChannelIdDraft(undefined);
    setDiscordEnabledDraft(undefined);
  }

  const resolvedSettings = () => settingsResource();
  const botToken = () =>
    botTokenDraft() ?? resolvedSettings()?.discordBotToken ?? "";
  const channelId = () =>
    channelIdDraft() ?? resolvedSettings()?.discordChannelId ?? "";
  const discordEnabled = () =>
    discordEnabledDraft() ?? resolvedSettings()?.discordEnabled ?? false;
  const trackingPaused = () => resolvedSettings()?.trackingPaused ?? false;
  const hasSavedBotToken = () =>
    resolvedSettings()?.hasDiscordBotToken ?? false;

  async function handleSubmit(event: Event) {
    event.preventDefault();
    setIsSaving(true);
    setSaveState("idle");
    setSaveErrorMessage(null);

    try {
      const nextHasSavedBotToken = botToken().trim().length > 0;
      const nextSettings = {
        discordBotToken: nextHasSavedBotToken ? MASKED_DISCORD_BOT_TOKEN : "",
        discordChannelId: channelId().trim(),
        discordEnabled: discordEnabled(),
        hasDiscordBotToken: nextHasSavedBotToken,
        trackingPaused: trackingPaused(),
      };

      await updateSettings({
        discordBotToken: botToken(),
        discordChannelId: channelId(),
        discordEnabled: discordEnabled(),
        trackingPaused: trackingPaused(),
      });
      query.set(getSettingsQuery.keyFor(), nextSettings);
      resetDrafts();
      await revalidate(getSettingsQuery.key, false);
      setSaveState("saved");
    } catch (error) {
      console.error("Failed to save settings", error);
      setSaveState("error");
      setSaveErrorMessage(
        error instanceof Error ? error.message : "Failed to save settings",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDiscordTest() {
    setIsDiscordTesting(true);
    setDiscordTestState("idle");

    try {
      await sendDiscordSettingsTest({
        discordBotToken: botToken(),
        discordChannelId: channelId(),
        discordEnabled: discordEnabled(),
      });
      setDiscordTestState("ok");
    } catch (error) {
      console.error("Failed to send Discord test message", error);
      setDiscordTestState("error");
      setDiscordTestErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to send Discord test message",
      );
    } finally {
      setIsDiscordTesting(false);
    }
  }

  const hasBotToken = () =>
    botTokenDraft() !== undefined
      ? botToken().trim().length > 0
      : hasSavedBotToken();

  const isDiscordEnabled = () => discordEnabled();
  const isConfigured = () => hasBotToken() && channelId().trim().length > 0;
  const isDiscordReady = () => isDiscordEnabled() && isConfigured();
  const isLoading = () => settingsResource() === undefined;

  return (
    <DashboardProvider enableWorkspaceFetching={false}>
      <Title>Settings | Warframe Market Tracker</Title>
      <AppShell>
        <DashboardShell>
          <main class="flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-editor">
            <div
              class="relative flex h-9 shrink-0 items-center border-b border-border bg-panel"
              data-testid="settings-tab-header"
            >
              <div
                class="flex h-full shrink-0 items-center border-r border-border"
                data-testid="settings-tab-navigation"
              >
                <button
                  aria-label="Select previous settings tab"
                  class="flex h-9 w-9 cursor-not-allowed items-center justify-center text-text-muted opacity-35"
                  disabled
                  type="button"
                >
                  <Icon class="h-4 w-4" path={chevronLeft} />
                </button>
                <button
                  aria-label="Select next settings tab"
                  class="flex h-9 w-9 cursor-not-allowed items-center justify-center border-l border-border text-text-muted opacity-35"
                  disabled
                  type="button"
                >
                  <Icon class="h-4 w-4" path={chevronRight} />
                </button>
              </div>
              <div class="flex h-full min-w-0 flex-1 overflow-x-auto">
                <div
                  class="relative flex h-full min-w-0"
                  data-testid="settings-tab"
                >
                  <div
                    aria-selected="true"
                    class={SETTINGS_TAB_BUTTON_CLASS}
                    role="tab"
                  >
                    <div class="flex min-w-0 items-center gap-1.5">
                      <span
                        class="min-w-0 truncate text-text-primary"
                        data-testid="settings-tab-label"
                      >
                        settings
                      </span>
                      <Icon
                        aria-hidden="true"
                        class="h-3.5 w-3.5 shrink-0 text-text-primary"
                        data-testid="settings-tab-cog-icon"
                        path={cog}
                      />
                    </div>
                    <A
                      aria-label="Close settings tab"
                      class={SETTINGS_TAB_CLOSE_CLASS}
                      data-testid="settings-tab-close"
                      href="/"
                    >
                      <Icon class="h-3.5 w-3.5" path={xMark} />
                    </A>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex w-full flex-1 flex-col px-4 py-6 lg:px-8 lg:py-8">
              <div class="mb-8 border-b border-border pb-5">
                <div>
                  <h1 class="font-mono text-2xl tracking-tight text-text-primary">
                    Settings
                  </h1>
                  <p class="mt-2 max-w-xl font-sans text-[13px] text-text-secondary">
                    Manage application preferences and integrations.
                  </p>
                </div>
              </div>

              <section class="flex flex-col gap-6">
                <form class="flex flex-col gap-6" onSubmit={handleSubmit}>
                  <div class="flex max-w-xl flex-col gap-3">
                    <h2 class="flex items-center gap-2 font-mono text-[12px] font-semibold uppercase tracking-widest text-text-primary">
                      Discord
                    </h2>
                    <p class="font-sans text-[12px] leading-relaxed text-text-muted">
                      Receive notifications when tracked items meet your
                      requirements.
                    </p>
                    <div class="pt-0.5">
                      <ToggleSwitch
                        checked={isDiscordEnabled()}
                        disabled={isLoading()}
                        label={
                          isDiscordEnabled()
                            ? "Discord alert on"
                            : "Discord alert off"
                        }
                        onChange={handleDiscordToggleChange}
                      />
                    </div>
                  </div>

                  <div class="flex w-full flex-col gap-6">
                    <div class="flex w-full flex-col gap-6 rounded-sm border border-border bg-surface-base p-5 shadow-sm sm:p-6">
                      <div class="flex flex-col gap-3">
                        <div class="flex flex-wrap items-center justify-between gap-3">
                          <label class="font-mono text-[11px] font-semibold uppercase tracking-widest text-text-secondary">
                            Bot Token
                          </label>
                          <a
                            class="font-mono text-[10px] text-accent-gold transition-all hover:underline underline-offset-2"
                            href="https://discord.com/developers/applications"
                            rel="noreferrer"
                            target="_blank"
                          >
                            [ Developer Portal ]
                          </a>
                        </div>
                        <Input
                          autocomplete="off"
                          class="w-full bg-editor font-mono text-[13px] shadow-inner transition-colors focus:border-accent-gold"
                          onInput={(event) =>
                            handleBotTokenInput(event.currentTarget.value)
                          }
                          placeholder="Paste bot token..."
                          type="password"
                          value={botToken()}
                        />
                        <Show when={hasSavedBotToken()}>
                          <p class="font-sans text-[11px] leading-relaxed text-text-muted">
                            Saved token is masked in the browser and encrypted
                            at rest on the server. Leave it as-is to keep it,
                            replace it by pasting a new token, or clear the
                            field to remove it.
                          </p>
                        </Show>
                        <Show when={!isDiscordEnabled() && !isLoading()}>
                          <p class="font-sans text-[11px] leading-relaxed text-text-muted">
                            Discord delivery is currently paused. Saved
                            credentials remain encrypted until you turn it back
                            on.
                          </p>
                        </Show>
                      </div>

                      <div class="flex flex-col gap-3">
                        <label class="font-mono text-[11px] font-semibold uppercase tracking-widest text-text-secondary">
                          Channel ID
                        </label>
                        <Input
                          autocomplete="off"
                          class="w-full bg-editor font-mono text-[13px] shadow-inner transition-colors focus:border-accent-gold"
                          onInput={(event) =>
                            handleChannelIdInput(event.currentTarget.value)
                          }
                          placeholder="Paste channel ID..."
                          value={channelId()}
                        />
                      </div>
                    </div>

                    <div class="flex flex-col gap-4">
                      <div class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                        <Button
                          class="h-9 w-full px-8 font-mono text-[11px] uppercase tracking-widest sm:w-auto"
                          disabled={isSaving()}
                          type="submit"
                        >
                          {isSaving() ? "Saving..." : "Save"}
                        </Button>

                        <Button
                          class="h-9 w-full px-8 font-mono text-[11px] uppercase tracking-widest sm:w-auto"
                          disabled={isDiscordTesting() || !isDiscordReady()}
                          onClick={handleDiscordTest}
                          type="button"
                          variant="secondary"
                        >
                          {isDiscordTesting() ? "Testing..." : "Test Discord"}
                        </Button>

                        <div class="flex flex-1 justify-center gap-4 sm:justify-end">
                          <Show when={isLoading()}>
                            <span class="font-mono text-[11px] uppercase tracking-widest text-text-muted">
                              Loading
                            </span>
                          </Show>
                          <Show when={saveState() === "saved"}>
                            <span class="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-accent-teal">
                              <Icon class="h-3.5 w-3.5" path={check} /> OK
                            </span>
                          </Show>
                          <Show when={saveState() === "error"}>
                            <span class="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-accent-danger">
                              <Icon
                                class="h-3.5 w-3.5"
                                path={exclamationTriangle}
                              />
                              ERR
                            </span>
                          </Show>
                          <Show when={discordTestState() === "error"}>
                            <span class="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-accent-danger">
                              <Icon
                                class="h-3.5 w-3.5"
                                path={exclamationTriangle}
                              />
                              FAIL
                            </span>
                          </Show>
                        </div>
                      </div>

                      <Show when={discordTestState() === "ok"}>
                        <div
                          class="rounded-sm border border-accent-teal/40 bg-accent-teal/10 px-4 py-3 shadow-sm"
                          data-testid="discord-test-success-card"
                        >
                          <div class="flex items-start gap-3">
                            <Icon
                              class="mt-0.5 h-4 w-4 shrink-0 text-accent-teal"
                              path={check}
                            />
                            <div class="flex flex-col gap-1">
                              <span class="font-mono text-[11px] uppercase tracking-widest text-accent-teal">
                                Discord test message sent
                              </span>
                              <p class="font-sans text-[12px] leading-relaxed text-text-secondary">
                                The web app sent a test message to the
                                configured channel.
                              </p>
                              <p class="font-sans text-[11px] leading-relaxed text-text-muted">
                                Live alerts still require the worker service to
                                use the same Discord settings.
                              </p>
                            </div>
                          </div>
                        </div>
                      </Show>

                      <Show when={discordTestState() === "error"}>
                        <div
                          class="rounded-sm border border-accent-danger/40 bg-accent-danger/10 px-4 py-3 shadow-sm"
                          data-testid="discord-test-error-card"
                        >
                          <div class="flex items-start gap-3">
                            <Icon
                              class="mt-0.5 h-4 w-4 shrink-0 text-accent-danger"
                              path={exclamationTriangle}
                            />
                            <div class="flex flex-col gap-1">
                              <span class="font-mono text-[11px] uppercase tracking-widest text-accent-danger">
                                Discord test failed
                              </span>
                              <p class="font-sans text-[12px] leading-relaxed text-text-secondary">
                                {discordTestErrorMessage() ??
                                  "Failed to send Discord test message"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Show>

                      <Show when={saveState() === "error"}>
                        <div class="rounded-sm border border-accent-danger/40 bg-accent-danger/10 px-4 py-3 shadow-sm">
                          <div class="flex items-start gap-3">
                            <Icon
                              class="mt-0.5 h-4 w-4 shrink-0 text-accent-danger"
                              path={exclamationTriangle}
                            />
                            <div class="flex flex-col gap-1">
                              <span class="font-mono text-[11px] uppercase tracking-widest text-accent-danger">
                                Settings save failed
                              </span>
                              <p class="font-sans text-[12px] leading-relaxed text-text-secondary">
                                {saveErrorMessage() ??
                                  "Failed to save settings"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Show>
                    </div>
                  </div>
                </form>
              </section>
            </div>
          </main>
        </DashboardShell>
      </AppShell>
    </DashboardProvider>
  );
}
