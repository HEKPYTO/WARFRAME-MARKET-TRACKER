export type SellerStatus = "ingame" | "offline" | "online";

export interface WatchRule {
  crossplay: boolean;
  id: string;
  itemSlug: string;
  maxPlatinum: number;
  platform: "pc";
}

export interface MarketOrder {
  id: string;
  itemId: string;
  platinum: number;
  quantity: number;
  rank: number;
  type: "buy" | "sell";
  updatedAt: string;
  user: {
    id: string;
    ingameName: string;
    lastSeen: string;
    slug: string;
    status: SellerStatus;
  };
  visible: boolean;
}

export interface SellerObservation {
  alertState?: "pending" | "sent";
  lastSeen: string;
  platinum: number;
  sellerId: string;
  sellerSlug: string;
  status: SellerStatus;
}

export interface WatchAlert {
  itemSlug: string;
  lastSeen: string;
  observedAt: string;
  platinum: number;
  ruleId: string;
  sellerId: string;
  sellerName: string;
  sellerSlug: string;
  status: Exclude<SellerStatus, "offline">;
}

export interface EvaluateWatchRuleInput {
  now: string;
  orders: MarketOrder[];
  previous: SellerObservation[];
  rule: WatchRule;
}

export interface EvaluateWatchRuleResult {
  alerts: WatchAlert[];
  observations: SellerObservation[];
}

function normalizeTimestamp(value: string): string {
  const parsed = Date.parse(value);

  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

function isVisibleUnrankedSellOrder(order: MarketOrder): boolean {
  return (
    order.type === "sell" &&
    order.visible &&
    (order.rank === 0 || order.rank === undefined || order.rank === null)
  );
}

function isQualifyingOrder(rule: WatchRule, order: MarketOrder): boolean {
  return (
    isVisibleUnrankedSellOrder(order) &&
    order.platinum <= rule.maxPlatinum &&
    order.user.status !== undefined
  );
}

function toObservation(order: MarketOrder): SellerObservation {
  return {
    lastSeen: normalizeTimestamp(order.user.lastSeen),
    platinum: order.platinum,
    sellerId: order.user.id,
    sellerSlug: order.user.slug,
    status: order.user.status,
  };
}

function toObservationWithAlertState(
  order: MarketOrder,
  alertState?: SellerObservation["alertState"],
): SellerObservation {
  const observation = toObservation(order);

  if (!alertState) {
    return observation;
  }

  return {
    ...observation,
    alertState,
  };
}

function selectObservationOrder(
  current: MarketOrder,
  candidate: MarketOrder,
): MarketOrder {
  if (candidate.platinum < current.platinum) {
    return candidate;
  }

  if (candidate.platinum > current.platinum) {
    return current;
  }

  return normalizeTimestamp(candidate.user.lastSeen) >
    normalizeTimestamp(current.user.lastSeen)
    ? candidate
    : current;
}

function isOnline(
  status: SellerStatus,
): status is Exclude<SellerStatus, "offline"> {
  return status === "online" || status === "ingame";
}

type PriceCluster = {
  count: number;
  maxPrice: number;
  minPrice: number;
};

function getVisibleSellPrices(orders: MarketOrder[]): number[] {
  return orders
    .filter(isVisibleUnrankedSellOrder)
    .map((order) => order.platinum)
    .sort((left, right) => left - right);
}

function getPriceClusterGapThreshold(price: number): number {
  return Math.max(1, Math.floor(price * 0.25));
}

function buildPriceClusters(prices: number[]): PriceCluster[] {
  const clusters: PriceCluster[] = [];

  for (const price of prices) {
    const currentCluster = clusters.at(-1);

    if (
      currentCluster &&
      price - currentCluster.maxPrice <=
        getPriceClusterGapThreshold(currentCluster.maxPrice)
    ) {
      currentCluster.count += 1;
      currentCluster.maxPrice = price;
      continue;
    }

    clusters.push({
      count: 1,
      maxPrice: price,
      minPrice: price,
    });
  }

  return clusters;
}

function findPriceClusterIndex(
  clusters: PriceCluster[],
  price: number,
): number | undefined {
  return clusters.findIndex(
    (cluster) => price >= cluster.minPrice && price <= cluster.maxPrice,
  );
}

function hasSupportedFloorPrice(input: {
  order: MarketOrder;
  orders: MarketOrder[];
}): boolean {
  const clusters = buildPriceClusters(getVisibleSellPrices(input.orders));
  const candidateClusterIndex = findPriceClusterIndex(
    clusters,
    input.order.platinum,
  );

  if (candidateClusterIndex === undefined || candidateClusterIndex < 0) {
    return false;
  }

  const candidateCluster = clusters[candidateClusterIndex];

  if (!candidateCluster) {
    return false;
  }

  return candidateCluster.count >= 2;
}

function isSuspiciousOutlier(input: {
  order: MarketOrder;
  orders: MarketOrder[];
  rule: WatchRule;
}): boolean {
  if (hasSupportedFloorPrice(input)) {
    return false;
  }

  const clusters = buildPriceClusters(getVisibleSellPrices(input.orders));
  const candidateClusterIndex = findPriceClusterIndex(
    clusters,
    input.order.platinum,
  );

  if (candidateClusterIndex === undefined || candidateClusterIndex < 0) {
    return true;
  }

  const candidateCluster = clusters[candidateClusterIndex];

  if (!candidateCluster) {
    return true;
  }

  if (candidateCluster.count >= 2) {
    return false;
  }

  const nextHigherCluster = clusters[candidateClusterIndex + 1];

  if (!nextHigherCluster) {
    return candidateCluster.maxPrice < input.rule.maxPlatinum * 0.5;
  }

  return candidateCluster.maxPrice < nextHigherCluster.minPrice * 0.5;
}

function isSameSuspiciousOffer(
  previous: SellerObservation | undefined,
  order: MarketOrder,
): boolean {
  if (!previous) {
    return false;
  }

  return previous.platinum === order.platinum;
}

export function evaluateWatchRule(
  input: EvaluateWatchRuleInput,
): EvaluateWatchRuleResult {
  const previousBySeller = new Map(
    input.previous.map((entry) => [entry.sellerId, entry]),
  );
  const qualifyingOrders = input.orders.filter((order) =>
    isQualifyingOrder(input.rule, order),
  );
  const observationsBySeller = new Map<string, MarketOrder>();
  const observations: SellerObservation[] = [];
  const alerts: WatchAlert[] = [];

  for (const order of qualifyingOrders) {
    const current = observationsBySeller.get(order.user.id);
    observationsBySeller.set(
      order.user.id,
      current ? selectObservationOrder(current, order) : order,
    );
  }

  for (const order of observationsBySeller.values()) {
    const previous = previousBySeller.get(order.user.id);
    const currentStatus = order.user.status;
    const currentLastSeen = normalizeTimestamp(order.user.lastSeen);
    const priceImproved =
      previous !== undefined && order.platinum < previous.platinum;
    const cameOnline =
      previous?.status === "offline" && isOnline(currentStatus);
    const firstSeenOnline = previous === undefined && isOnline(currentStatus);
    const suspiciousOutlier = isSuspiciousOutlier({
      order,
      orders: input.orders,
      rule: input.rule,
    });
    const sameSuspiciousOffer = isSameSuspiciousOffer(previous, order);
    const alreadyAlertedSuspiciousOffer =
      suspiciousOutlier &&
      previous?.alertState === "sent" &&
      sameSuspiciousOffer &&
      isOnline(currentStatus);
    const releasedPendingSuspiciousOffer =
      !suspiciousOutlier &&
      previous?.alertState === "pending" &&
      isOnline(currentStatus);
    const shouldDelaySuspiciousOffer =
      suspiciousOutlier &&
      isOnline(currentStatus) &&
      !alreadyAlertedSuspiciousOffer;

    if (shouldDelaySuspiciousOffer) {
      observations.push(toObservationWithAlertState(order, "pending"));
      continue;
    }

    observations.push(
      toObservationWithAlertState(
        order,
        alreadyAlertedSuspiciousOffer || releasedPendingSuspiciousOffer
          ? "sent"
          : undefined,
      ),
    );

    if (
      !alreadyAlertedSuspiciousOffer &&
      isOnline(currentStatus) &&
      (releasedPendingSuspiciousOffer ||
        priceImproved ||
        cameOnline ||
        firstSeenOnline)
    ) {
      alerts.push({
        itemSlug: input.rule.itemSlug,
        lastSeen: currentLastSeen,
        observedAt: input.now,
        platinum: order.platinum,
        ruleId: input.rule.id,
        sellerId: order.user.id,
        sellerName: order.user.ingameName,
        sellerSlug: order.user.slug,
        status: currentStatus,
      });
    }
  }

  return {
    alerts,
    observations,
  };
}
