// 대응 우선순위·레인(설계서 §4-4-5).
// 우선순위 = 잔여대응여유 m = S_low − min(R_q, a_min) 오름차순 → P_int(자원 없음) 내림차순 → 가구 ID.
import type { EngineParams, PlanRow, RestoreDist } from "../types";
import { quantileRemaining, survRemaining } from "./survival";

/** R_q: 남은 복구 P80(칸 표본 적음이면 P90). */
export function rqMin(d: RestoreDist, p: EngineParams): number {
  const q = (d.kind === "lognormal" || d.kind === "piecewise") && d.small_cell ? p.q_small : p.q_main;
  return quantileRemaining(d, q);
}

export function marginMin(s_low: number, rq: number, a_min: number | null): number {
  return s_low - Math.min(rq, a_min ?? Infinity);
}

type PKey = Pick<PlanRow, "margin_min" | "p_int0" | "hid">;
export function priorityCompare(a: PKey, b: PKey): number {
  if (a.margin_min !== b.margin_min) return a.margin_min - b.margin_min;
  if (a.p_int0 !== b.p_int0) return b.p_int0 - a.p_int0;
  return a.hid < b.hid ? -1 : a.hid > b.hid ? 1 : 0;
}

/** 레인(위에서부터 고정): ① 119 연계 검토 ② 수동확인 필요 ③ 나머지 표. */
export function laneOf(row: Pick<PlanRow, "safe" | "rid" | "arrival_min">, d: RestoreDist, p: EngineParams): Pick<PlanRow, "lane" | "lane_reason"> {
  if (row.safe.status === "unknown") return { lane: "manual", lane_reason: "unknown" };
  const s = row.safe.s_low_engine_min;
  const late = row.rid == null || (row.arrival_min != null && row.arrival_min > s);
  if (late && survRemaining(d, s) >= p.lane119_pmin) {
    return { lane: "119", lane_reason: row.rid == null ? "no_compatible" : "late_arrival" };
  }
  if (row.safe.flags.includes("conflict")) return { lane: "manual", lane_reason: "conflict" };
  return { lane: "main" };
}
