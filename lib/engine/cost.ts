// 사전식 비용(설계서 §4-4-4): round(P_int × 10⁴) × 10⁷ + round(EI × 10). 기기 종류 가중치 없음.
import type { RestoreDist } from "../types";
import { partialExpRemaining, survRemaining } from "./survival";

export const INFEASIBLE = 1e14;

export interface CostInput { s_low: number; arrival: number | null; supply: number | null }
export interface CostOut { p_int: number; ei_min: number; int_cost: number }

export function lexCost(p_int: number, ei_min: number): number {
  return Math.round(p_int * 1e4) * 1e7 + Math.round(ei_min * 10);
}

export function cost(x: CostInput, d: RestoreDist): CostOut {
  const s = Math.max(0, x.s_low);
  let p: number, ei: number;
  if (x.arrival == null) { // 자원 없음
    p = survRemaining(d, s);
    ei = partialExpRemaining(d, s);
  } else {
    const a = x.arrival, c = Math.max(0, x.supply ?? 0);
    if (a <= s) {
      p = survRemaining(d, s + c);
      ei = partialExpRemaining(d, s + c);
    } else {
      p = survRemaining(d, s);
      ei = partialExpRemaining(d, s) - partialExpRemaining(d, a) + partialExpRemaining(d, a + c);
    }
  }
  ei = Math.max(0, ei);
  return { p_int: p, ei_min: ei, int_cost: lexCost(p, ei) };
}
