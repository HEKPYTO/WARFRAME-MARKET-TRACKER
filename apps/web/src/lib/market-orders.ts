import type { MarketOrder } from "@warframe-market-tracker/alert-engine";

export function isVisibleSellOrder(order: MarketOrder): boolean {
  return (
    order.visible &&
    order.type === "sell" &&
    (order.rank === 0 || order.rank === undefined || order.rank === null)
  );
}

export function byPriceAscending(
  left: MarketOrder,
  right: MarketOrder,
): number {
  return left.platinum - right.platinum;
}

export function listVisibleSellOrders(orders: MarketOrder[]): MarketOrder[] {
  return orders.filter(isVisibleSellOrder).sort(byPriceAscending);
}

export function getLowestVisibleSellPrice(orders: MarketOrder[]): number {
  return listVisibleSellOrders(orders)[0]?.platinum ?? 0;
}
