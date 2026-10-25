// 참값 채점 (구현명세 §6-6 scoreTruth, 설계서 §4-4-7) — C 소유.
// 모든 배정 방법은 observed만 보고 배정하고, 여기서는 truth로 채점한다.
// - 배정 자원이 **truth 기기와** 호환되지 않으면 보호 없음(+ 위반 1건).
// - Tb = battery + ext_usable + spare_o2 (판단 시각 기준 참값, 분), a = 참값 세계의 도착(분), C = 참값 기기 기준 공급(분), R = 참값 남은 복구(분).
//   a ≤ Tb → 중단 = max(0, R − (Tb + C)) · a > Tb → max(0, min(R,a) − Tb) + max(0, R − (a + C)) · 자원 없음 → max(0, R − Tb).
import type { AllocInput, EngineParams, Plan, ScoreRow } from "../types";
import { arrival, supply } from "./arrival";
import { compat } from "./compat";
import { findDevice } from "./safeTime";

export interface ScoreDetail extends ScoreRow {
  /** 가구별 중단 분(hid → 분) */
  per: Record<string, number>;
  assigned: number;
  unknown_assigned: number;
}

/**
 * @param truthParams 참값 세계의 이동 속도·출동 준비 등(민감도 「불일치」 행에서 엔진과 다르게 둔다). 기본 = input.params.
 */
export function scoreTruth(plan: Plan, input: AllocInput, truthRemaining_min: number, truthParams?: EngineParams): ScoreDetail {
  const tp = truthParams ?? input.params;
  const R = Math.max(0, truthRemaining_min);
  const hById = new Map(input.households.map((h) => [h.id, h] as const));
  const rById = new Map(input.resources.map((r) => [r.id, r] as const));
  let interrupted = 0, interruption = 0, violations = 0, energyShort = 0, assigned = 0, unknownAssigned = 0;
  const per: Record<string, number> = {};

  for (const row of plan.rows) {
    const h = hById.get(row.hid);
    if (!h || !h.truth) continue;
    const t = h.truth;
    const Tb = Math.max(0, t.battery_min + t.ext_usable_min + t.spare_o2_min);
    let mins: number;
    const r = row.rid ? rById.get(row.rid) : undefined;
    if (r) {
      assigned++;
      if (row.safe.status === "unknown") unknownAssigned++;
      const dev = findDevice(input.specs, t.device_id);
      const ok = compat(dev, r, tp).ok;
      if (!ok) {
        violations++;
        mins = Math.max(0, R - Tb);
      } else {
        const a = arrival(h, r, input.urban, input.weather, tp);
        const C = supply(dev, r, tp);
        if (a <= Tb) mins = Math.max(0, R - (Tb + C));
        else mins = Math.max(0, Math.min(R, a) - Tb) + Math.max(0, R - (a + C));
        if (R > Math.max(a, Tb) + C) energyShort++;
      }
    } else {
      mins = Math.max(0, R - Tb);
    }
    per[row.hid] = mins;
    interruption += mins;
    if (mins > 0) interrupted++;
  }
  return {
    interrupted,
    interruption_min: interruption,
    violations,
    energy_short: energyShort,
    unknown_share: assigned > 0 ? unknownAssigned / assigned : 0,
    per,
    assigned,
    unknown_assigned: unknownAssigned,
  };
}
