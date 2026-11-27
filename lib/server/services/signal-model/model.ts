import { FEATURE_NAMES, type FeatureName, type FeatureVector } from "./features";

/**
 * Oddiy, shaffof model: standartlashtirilgan xususiyatlar ustida L2 logistik regressiya.
 * Natija — signalning foyda bilan yopilish ehtimoli (0–1). Koeffitsientlar JSON sifatida
 * kodga yoziladi (`weights.ts`), live'da qayta o'qitilmaydi.
 */
export interface LogisticModel {
  features: FeatureName[];
  mean: number[];
  std: number[];
  weights: number[];
  bias: number;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function fitLogistic(
  rows: FeatureVector[],
  labels: number[],
  options: { features?: FeatureName[]; l2?: number; iterations?: number; lr?: number } = {},
): LogisticModel {
  const features = options.features ?? [...FEATURE_NAMES];
  const l2 = options.l2 ?? 1;
  const iterations = options.iterations ?? 400;
  const lr = options.lr ?? 0.5;
  const n = rows.length;
  const k = features.length;

  const X = rows.map((r) => features.map((f) => r[f]));
  const mean = features.map((_, j) => X.reduce((s, x) => s + x[j]!, 0) / n);
  const std = features.map((_, j) => Math.sqrt(X.reduce((s, x) => s + (x[j]! - mean[j]!) ** 2, 0) / n) || 1);
  const Z = X.map((x) => x.map((v, j) => (v - mean[j]!) / std[j]!));

  const w = new Array<number>(k).fill(0);
  const base = labels.reduce((s, y) => s + y, 0) / n;
  let b = Math.log(base / (1 - base));

  for (let it = 0; it < iterations; it++) {
    const gw = new Array<number>(k).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const z = Z[i]!;
      let s = b;
      for (let j = 0; j < k; j++) s += w[j]! * z[j]!;
      const err = sigmoid(s) - labels[i]!;
      gb += err;
      for (let j = 0; j < k; j++) gw[j]! += err * z[j]!;
    }
    for (let j = 0; j < k; j++) w[j]! -= lr * (gw[j]! / n + (l2 * w[j]!) / n);
    b -= lr * (gb / n);
  }

  return { features, mean, std, weights: w, bias: b };
}

export function predictProbability(model: LogisticModel, row: FeatureVector): number {
  let s = model.bias;
  model.features.forEach((f, j) => {
    s += model.weights[j]! * ((row[f] - model.mean[j]!) / model.std[j]!);
  });
  return sigmoid(s);
}
