export const MASKED_DISCORD_BOT_TOKEN = "••••••••••••••••";

export interface UserSettingsResponse {
  discordBotToken: string;
  discordChannelId: string;
  discordEnabled: boolean;
  trackingPaused: boolean;
  hasDiscordBotToken: boolean;
}

export interface UpdateUserSettingsPayload {
  discordBotToken: string;
  discordChannelId: string;
  discordEnabled: boolean;
  trackingPaused: boolean;
}

export function maskDiscordBotToken(token: string | null | undefined): string {
  return token?.trim() ? MASKED_DISCORD_BOT_TOKEN : "";
}

export function isMaskedDiscordBotToken(value: string): boolean {
  return value === MASKED_DISCORD_BOT_TOKEN;
}
