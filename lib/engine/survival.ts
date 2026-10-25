// 남은 복구시간 T_rem(분)의 생존·분위수·부분기대값(구현명세 §6-6 로그정규 해석식).
// 로그정규는 시간 단위로 계산한 뒤 분으로 바꾼다. fixed·oracle은 계단(결정적 남은 시간).
import type { RestoreDist } from "../types";

/** 표준정규 CDF Φ(x). Hart(1968) 5666 유리근사 — West(2005) 배정밀도판, 절대오차 약 1e-14. */
export function normCdf(x: number): number {
  const a = Math.abs(x);
  let c: number;
  if (a > 37) c = 0;
  else {
    const e = Math.exp(-a * a / 2);
    if (a < 7.07106781186547) {
      let b = 3.52624965998911e-2 * a + 0.700383064443688;
      b = b * a + 6.37396220353165; b = b * a + 33.912866078383; b = b * a + 112.079291497871;
      b = b * a + 221.213596169931; b = b * a + 220.206867912376;
      c = e * b;
      b = 8.83883476483184e-2 * a + 1.75566716318264;
      b = b * a + 16.064177579207; b = b * a + 86.7807322029461; b = b * a + 296.564248779674;
      b = b * a + 637.333633378831; b = b * a + 793.826512519948; b = b * a + 440.413735824752;
      c = c / b;
    } else {
      let b = a + 0.65; b = a + 4 / b; b = a + 3 / b; b = a + 2 / b; b = a + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}

/** 위쪽 꼬리 1 − Φ(x)를 뺄셈 없이(작은 꼬리 정밀도 유지). */
export function normSf(x: number): number {
  return normCdf(-x);
}

/** 표준정규 분위수 Φ⁻¹(p). Acklam 근사 + Newton 1회. */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let x: number;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pl) {
    const q = p - 0.5, r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // Newton 1회
  const err = normCdf(x) - p;
  const pdf = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  if (pdf > 0) x = x - err / pdf;
  return x;
}

// ── 시간 단위 로그정규 T ~ LogNormal(μ, σ) ──
/** S(u) = P(T > u), u ≤ 0이면 1. */
export function lnSurv(mu: number, sigma: number, u: number): number {
  if (u <= 0) return 1;
  return normSf((Math.log(u) - mu) / sigma);
}
/** G(x) = E[(T − x)⁺]. x ≤ 0이면 E[T] − x. */
export function lnPartialExp(mu: number, sigma: number, x: number): number {
  const m = Math.exp(mu + sigma * sigma / 2);
  if (x <= 0) return m - x;
  const lx = Math.log(x);
  return m * normCdf((mu + sigma * sigma - lx) / sigma) - x * normCdf((mu - lx) / sigma);
}
/** 경과 e 조건부 분위수(남은 시간): q_p = exp(μ + σ·Φ⁻¹(1 − (1 − p)·S(e))) − e. */
export function lnCondQuantile(mu: number, sigma: number, e: number, p: number): number {
  const se = lnSurv(mu, sigma, e);
  return Math.max(0, Math.exp(mu + sigma * normInv(1 - (1 - p) * se)) - e);
}

export const TAIL_EPS = 1e-12;

/** 경과 시간(시간). S(e)가 1e-12 아래면(표본 범위 밖) 경과 0으로 되돌려 전체 분포(보수값)를 쓴다. */
function effElapsedH(d: Extract<RestoreDist, { kind: "lognormal" }>): number {
  const e = Math.max(0, d.elapsed_min) / 60;
  return lnSurv(d.mu, d.sigma, e) < TAIL_EPS ? 0 : e;
}

/** 남은 복구 경과가 분포 꼬리 끝(표본 범위 밖)인가. */
export function isOutOfRange(d: RestoreDist): boolean {
  return d.kind === "lognormal" && lnSurv(d.mu, d.sigma, Math.max(0, d.elapsed_min) / 60) < TAIL_EPS;
}

/** P(T_rem > t), t는 분. */
export function survRemaining(d: RestoreDist, t: number): number {
  if (d.kind !== "lognormal") return t < d.remaining_min ? 1 : 0;
  if (t <= 0) return 1;
  const e = effElapsedH(d);
  return lnSurv(d.mu, d.sigma, e + t / 60) / lnSurv(d.mu, d.sigma, e);
}

/** T_rem의 p 분위수(분). */
export function quantileRemaining(d: RestoreDist, p: number): number {
  if (d.kind !== "lognormal") return d.remaining_min;
  return lnCondQuantile(d.mu, d.sigma, effElapsedH(d), p) * 60;
}

/** E[(T_rem − x)⁺](분), x는 분. x < 0이면 E[T_rem] − x. */
export function partialExpRemaining(d: RestoreDist, x: number): number {
  if (d.kind !== "lognormal") return Math.max(0, d.remaining_min - x);
  const e = effElapsedH(d);
  const se = lnSurv(d.mu, d.sigma, e);
  if (x < 0) return lnPartialExp(d.mu, d.sigma, e) / se * 60 - x;
  return lnPartialExp(d.mu, d.sigma, e + x / 60) / se * 60;
}

/** μ(x) = intercept + night·coef.night + G2·coef.G2 + G3·coef.G3 (구현명세 §6-5). */
export function muOf(coef: { intercept: number; night: number; G2: number; G3: number }, group: "G1" | "G2" | "G3", night: boolean): number {
  return coef.intercept + (night ? coef.night : 0) + (group === "G2" ? coef.G2 : 0) + (group === "G3" ? coef.G3 : 0);
}
