// 「두 막대 경주」 쇼케이스 가구 자동 선택(설계서 §4-4-6). 사람이 고르지 않는다.
import type { Plan, PlanRow, RestoreDist } from "../types";
import { quantileRemaining } from "./survival";

/** 빨간 구간 길이(분) = max(0, min(도착, R80) − S_low). 전원 없음 → max(0, R80 − S_low). */
export function redMinutes(row: Pick<PlanRow, "safe" | "arrival_min">, r80: number): number {
  const s = row.safe.s_low_engine_min;
  const end = row.arrival_min == null ? r80 : Math.min(row.arrival_min, r80);
  return Math.max(0, end - s);
}

/**
 * 단순 규칙과 숨시계의 배정 자원이 다른 가구 중 (규칙 빨간 분 − 숨시계 빨간 분)이 가장 큰 가구(0보다 클 때만), 같으면 ID 순.
 * 「모름」 가구는 막대 길이를 그릴 수 없어 뺀다.
 */
export function pickShowcase(ours: Plan, r1: Plan, d: RestoreDist): string | null {
  const r80 = quantileRemaining(d, 0.8);
  const byR1 = new Map(r1.rows.map((r) => [r.hid, r] as const));
  let best: { hid: string; gain: number } | null = null;
  const sorted = [...ours.rows].sort((a, b) => (a.hid < b.hid ? -1 : a.hid > b.hid ? 1 : 0));
  for (const o of sorted) {
    const q = byR1.get(o.hid);
    if (!q || o.safe.status === "unknown") continue;
    if ((o.rid ?? null) === (q.rid ?? null)) continue;
    const gain = redMinutes(q, r80) - redMinutes(o, r80);
    if (gain > 0 && (!best || gain > best.gain)) best = { hid: o.hid, gain };
  }
  return best ? best.hid : null;
}
