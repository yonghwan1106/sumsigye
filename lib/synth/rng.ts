// 결정적 난수(구현명세 §6-7): mulberry32(seed). 표준 구현.
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** U(lo, hi) 연속. */
export const unif = (r: Rng, lo: number, hi: number): number => lo + (hi - lo) * r();
/** U{lo..hi} 정수(양끝 포함). */
export const unifInt = (r: Rng, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
/** N(0, 1) — Box–Muller(난수 2개 소비). */
export function normal(r: Rng): number {
  const u = Math.max(r(), 1e-12), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
/** 가중치 목록에서 하나 고르기. */
export function pickWeighted<T>(r: Rng, items: readonly (readonly [T, number])[]): T {
  const tot = items.reduce((a, [, w]) => a + w, 0);
  let x = r() * tot;
  for (const [v, w] of items) { if ((x -= w) < 0) return v; }
  return items[items.length - 1][0];
}
/** Fisher–Yates 섞기(새 배열). */
export function shuffled<T>(r: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
