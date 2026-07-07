export function formatLocalDisplayTimestamp(value: string) {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return value;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: true,
    minute: "2-digit",
    month: "short",
  }).formatToParts(new Date(parsed));
  const byType = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  const hour = byType.hour;
  const minute = byType.minute;
  const dayPeriod = byType.dayPeriod;
  const month = byType.month;
  const day = byType.day;

  if (
    hour === undefined ||
    minute === undefined ||
    dayPeriod === undefined ||
    month === undefined ||
    day === undefined
  ) {
    return value;
  }

  return `${hour}:${minute} ${dayPeriod.toUpperCase()} ${month.toUpperCase()} ${day}`;
}
