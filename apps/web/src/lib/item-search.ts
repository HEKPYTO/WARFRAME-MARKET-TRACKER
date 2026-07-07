import type { ItemCatalogEntry } from "@warframe-market-tracker/market-client";

export type { ItemCatalogEntry };

export function normalizeItemSearchValue(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function tokenizeSearchValue(value: string): string[] {
  return normalizeItemSearchValue(value).split(" ").filter(Boolean);
}

function getCandidateTokens(item: ItemCatalogEntry): string[] {
  const tokens = new Set<string>();

  for (const token of tokenizeSearchValue(item.name)) {
    tokens.add(token);
  }

  for (const token of tokenizeSearchValue(item.slug)) {
    tokens.add(token);
  }

  return [...tokens];
}

function canMatchTokens(
  queryTokens: string[],
  candidateTokens: string[],
  matcher: (queryToken: string, candidateToken: string) => boolean,
): boolean {
  const used = new Set<number>();

  function assignToken(queryIndex: number): boolean {
    if (queryIndex >= queryTokens.length) {
      return true;
    }

    const queryToken = queryTokens[queryIndex]!;

    for (
      let candidateIndex = 0;
      candidateIndex < candidateTokens.length;
      candidateIndex += 1
    ) {
      if (used.has(candidateIndex)) {
        continue;
      }

      if (!matcher(queryToken, candidateTokens[candidateIndex]!)) {
        continue;
      }

      used.add(candidateIndex);

      if (assignToken(queryIndex + 1)) {
        return true;
      }

      used.delete(candidateIndex);
    }

    return false;
  }

  return assignToken(0);
}

function getMaxFuzzyDistance(token: string): number {
  if (token.length <= 4) {
    return 1;
  }

  if (token.length <= 8) {
    return 1;
  }

  return 2;
}

function getEditDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  const current = new Array<number>(right.length + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;

      current[rightIndex] = Math.min(
        previous[rightIndex]! + 1,
        current[rightIndex - 1]! + 1,
        previous[rightIndex - 1]! + substitutionCost,
      );
    }

    for (let rightIndex = 0; rightIndex <= right.length; rightIndex += 1) {
      previous[rightIndex] = current[rightIndex]!;
    }
  }

  return previous[right.length]!;
}

function getSearchRank(item: ItemCatalogEntry, query: string): number | null {
  const normalizedName = normalizeItemSearchValue(item.name);
  const normalizedSlug = normalizeItemSearchValue(item.slug);
  const queryTokens = tokenizeSearchValue(query);
  const candidateTokens = getCandidateTokens(item);

  if (normalizedName === query || normalizedSlug === query) {
    return 0;
  }

  if (normalizedName.startsWith(query) || normalizedSlug.startsWith(query)) {
    return 1;
  }

  if (
    canMatchTokens(queryTokens, candidateTokens, (queryToken, candidateToken) =>
      candidateToken.startsWith(queryToken),
    )
  ) {
    return 2;
  }

  if (
    canMatchTokens(queryTokens, candidateTokens, (queryToken, candidateToken) =>
      candidateToken.includes(queryToken),
    )
  ) {
    return 3;
  }

  if (normalizedName.includes(query) || normalizedSlug.includes(query)) {
    return 4;
  }

  if (
    queryTokens.length > 0 &&
    canMatchTokens(
      queryTokens,
      candidateTokens,
      (queryToken, candidateToken) => {
        if (queryToken.length < 3) {
          return false;
        }

        const maxDistance = getMaxFuzzyDistance(queryToken);
        const lengthGap = Math.abs(queryToken.length - candidateToken.length);

        if (lengthGap > maxDistance) {
          return false;
        }

        return getEditDistance(queryToken, candidateToken) <= maxDistance;
      },
    )
  ) {
    return 5;
  }

  return null;
}

export function searchCatalogItems(
  catalog: ItemCatalogEntry[],
  query: string,
  limit = 8,
): ItemCatalogEntry[] {
  const normalizedQuery = normalizeItemSearchValue(query);

  if (normalizedQuery.length === 0) {
    return [];
  }

  return catalog
    .flatMap((item, index) => {
      const rank = getSearchRank(item, normalizedQuery);

      if (rank === null) {
        return [];
      }

      return [{ index, item, rank }];
    })
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      const leftName = normalizeItemSearchValue(left.item.name);
      const rightName = normalizeItemSearchValue(right.item.name);
      const lexicalOrder = leftName.localeCompare(rightName);

      if (lexicalOrder !== 0) {
        return lexicalOrder;
      }

      return left.index - right.index;
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}
