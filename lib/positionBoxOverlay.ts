export interface PositionBoxLayout {
  left: number;
  width: number;
  profitTop: number;
  profitHeight: number;
  lossTop: number;
  lossHeight: number;
  entryTop: number;
  visible: boolean;
}

export interface PositionBoxPrices {
  entry: number;
  stopLoss: number;
  takeProfit: number;
  side: "long" | "short";
}

export function computePositionBoxLayout(
  prices: PositionBoxPrices,
  priceToY: (price: number) => number | null,
  timeToX: (time: number) => number | null,
  startTime: number,
  endTime: number,
): PositionBoxLayout {
  const entryY = priceToY(prices.entry);
  const tpY = priceToY(prices.takeProfit);
  const slY = priceToY(prices.stopLoss);
  const xStart = timeToX(startTime);
  const xEnd = timeToX(endTime);

  if (
    entryY === null ||
    tpY === null ||
    slY === null ||
    xStart === null ||
    xEnd === null
  ) {
    return {
      left: 0,
      width: 0,
      profitTop: 0,
      profitHeight: 0,
      lossTop: 0,
      lossHeight: 0,
      entryTop: 0,
      visible: false,
    };
  }

  const left = Math.min(xStart, xEnd);
  const width = Math.max(Math.abs(xEnd - xStart), 48) + 56;
  const isLong = prices.side === "long";

  const profitTop = isLong ? Math.min(tpY, entryY) : Math.min(entryY, tpY);
  const profitHeight = Math.abs(entryY - tpY);
  const lossTop = isLong ? Math.min(entryY, slY) : Math.min(slY, entryY);
  const lossHeight = Math.abs(entryY - slY);

  if (profitHeight < 1 && lossHeight < 1) {
    return {
      left,
      width,
      profitTop: 0,
      profitHeight: 0,
      lossTop: 0,
      lossHeight: 0,
      entryTop: entryY,
      visible: false,
    };
  }

  return {
    left,
    width,
    profitTop,
    profitHeight: Math.max(profitHeight, 1),
    lossTop,
    lossHeight: Math.max(lossHeight, 1),
    entryTop: entryY,
    visible: true,
  };
}
