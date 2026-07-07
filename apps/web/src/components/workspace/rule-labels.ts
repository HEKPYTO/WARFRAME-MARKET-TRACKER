const RULE_LABEL_CACHE_KEY = "wmt-rule-label-cache:v1";

export interface StorageLike {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

function formatRuleSlug(itemSlug: string) {
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

function isValidRuleLabelRecord(
  value: unknown,
): value is Record<string, string> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.values(value).every(
    (label) => typeof label === "string" && label.length > 0,
  );
}

export function getRuleDisplayLabel(
  itemSlug: string,
  itemLabelsBySlug: Record<string, string>,
) {
  return itemLabelsBySlug[itemSlug] ?? formatRuleSlug(itemSlug);
}

export function persistRuleLabelCache(
  storage: StorageLike,
  itemLabelsBySlug: Record<string, string>,
) {
  storage.setItem(RULE_LABEL_CACHE_KEY, JSON.stringify(itemLabelsBySlug));
}

export function readRuleLabelCache(storage: StorageLike) {
  const rawValue = storage.getItem(RULE_LABEL_CACHE_KEY);

  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (!isValidRuleLabelRecord(parsed)) {
      storage.removeItem(RULE_LABEL_CACHE_KEY);
      return {};
    }

    return parsed;
  } catch {
    storage.removeItem(RULE_LABEL_CACHE_KEY);
    return {};
  }
}
