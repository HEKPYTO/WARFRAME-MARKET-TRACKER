export type DiscordAlertStatus = "ingame" | "online";
export { formatLocalDisplayTimestamp } from "./date-display";
import { formatLocalDisplayTimestamp } from "./date-display";

export type DiscordAlertCardField = {
  label: string;
  value: string;
};

export type DiscordAlertCardInput = {
  appBaseUrl: string;
  itemSlug: string;
  lastSeen: string;
  observedAt: string;
  platinum: number;
  ruleId: string;
  sellerName: string;
  status: DiscordAlertStatus;
  targetPlatinum?: number | null;
};

export type DiscordAlertCardPresentation = {
  actions: Array<{
    label: string;
    url: string;
  }>;
  description: string;
  fields: DiscordAlertCardField[];
  tradeMessage: string;
  title: string;
};

export type DiscordTestMessagePresentation = {
  description: string;
  fields: DiscordAlertCardField[];
  title: string;
};

export type DiscordMessagePayload = {
  allowed_mentions: {
    parse: string[];
  };
  components: unknown[];
  embeds: Array<Record<string, unknown>>;
};

export const DISCORD_ALERT_COLOR = 5793266;

export function formatDiscordItemLabel(itemSlug: string) {
  return itemSlug
    .split(/[_-]+/)
    .filter(Boolean)
    .map((segment) => {
      const [firstCharacter = "", ...restCharacters] = segment;

      return (
        firstCharacter.toUpperCase() + restCharacters.join("").toLowerCase()
      );
    })
    .join(" ");
}

function formatStatus(status: DiscordAlertStatus) {
  return status === "ingame" ? "In Game" : "Online";
}

function getItemUrl(itemSlug: string) {
  return `https://warframe.market/items/${itemSlug}`;
}

export function getTrackerItemUrl(input: {
  appBaseUrl: string;
  ruleId: string;
}) {
  const normalizedBaseUrl = input.appBaseUrl.trim().replace(/\/+$/, "");
  const trackerUrl = new URL(`${normalizedBaseUrl}/`);

  trackerUrl.searchParams.set("ruleId", input.ruleId);
  return trackerUrl.toString();
}

function buildDeltaLabel(input: DiscordAlertCardInput) {
  if (typeof input.targetPlatinum !== "number") {
    return "Match";
  }

  const delta = input.targetPlatinum - input.platinum;

  if (delta > 0) {
    return `${delta}p under`;
  }

  if (delta < 0) {
    return `${Math.abs(delta)}p over`;
  }

  return "At target";
}

export function buildTradeMessage(input: {
  itemSlug: string;
  platinum: number;
  sellerName: string;
}) {
  return `/w ${input.sellerName} Hi! Want to buy "${formatDiscordItemLabel(input.itemSlug)}" for ${input.platinum} platinum. (warframe.market)`;
}

export function buildDiscordAlertMessagePayload(
  input: DiscordAlertCardInput,
): DiscordAlertCardPresentation {
  const tradeMessage = buildTradeMessage({
    itemSlug: input.itemSlug,
    platinum: input.platinum,
    sellerName: input.sellerName,
  });

  return {
    actions: [
      {
        label: "Open Market",
        url: getItemUrl(input.itemSlug),
      },
      {
        label: "Open Tracker",
        url: getTrackerItemUrl({
          appBaseUrl: input.appBaseUrl,
          ruleId: input.ruleId,
        }),
      },
    ],
    description: `${input.sellerName} sells for ${input.platinum}p`,
    fields: [
      {
        label: "Status",
        value: formatStatus(input.status),
      },
      {
        label: "Target",
        value:
          typeof input.targetPlatinum === "number"
            ? `${input.targetPlatinum}p`
            : "Tracked",
      },
      {
        label: "Delta",
        value: buildDeltaLabel(input),
      },
      {
        label: "Alerted",
        value: formatLocalDisplayTimestamp(input.observedAt),
      },
    ],
    tradeMessage,
    title: formatDiscordItemLabel(input.itemSlug),
  };
}

export function buildDiscordTestMessagePresentation(input: {
  checkedAt: string;
}): DiscordTestMessagePresentation {
  return {
    description:
      "Signal path is clear. Warframe Market Tracker can post alerts to this channel.",
    fields: [
      {
        label: "Checked",
        value: formatLocalDisplayTimestamp(input.checkedAt),
      },
    ],
    title: "Discord connection verified",
  };
}
