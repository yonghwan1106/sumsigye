// 숨시계 배정기(ours) — 승인된 배정을 먼저 고정하고 나머지를 사전식 비용 헝가리안으로 푼다(설계서 §4-4-4).
import type { AllocInput, DeviceSpec, ExclusionReason, Household, Plan, PlanRow, Resource, SafeTime } from "../types";
import { arrival, supply } from "./arrival";
import { compat, type CompatResult } from "./compat";
import { cost, INFEASIBLE, type CostOut } from "./cost";
import { hungarian } from "./hungarian";
import { laneOf, marginMin, priorityCompare, rqMin } from "./priority";
import { findDevice, safeTime } from "./safeTime";
import { addMinutes, minutesBetween } from "./time";

export const nowMs = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

export interface Cand { r: Resource; c: CompatResult; arrival: number; supply: number }
export interface Prepared { h: Household; dev: DeviceSpec | null; safe: SafeTime; cands: Cand[]; none: CostOut }

/** 가구마다 L3 값·자원별 호환/도착/공급·「자원 없음」 비용을 계산한다(배정기·기준선 공용). */
export function prepare(input: AllocInput): Prepared[] {
  const { households, resources, specs, now, urban, weather, params, restore } = input;
  return households.map((h) => {
    const dev = findDevice(specs, h.observed.device_id);
    const safe = safeTime(h, specs, now, params, weather);
    const cands = resources.map((r) => ({
      r, c: compat(dev, r, params), arrival: arrival(h, r, urban, weather, params), supply: supply(dev, r, params),
    }));
    const none = cost({ s_low: safe.s_low_engine_min, arrival: null, supply: null }, restore);
    return { h, dev, safe, cands, none };
  });
}

/**
 * 배정(가구 → 자원 id 또는 null)으로 PlanRow를 만들고 우선순위·레인을 붙인다.
 * 기준선(baselines.ts, C)도 이 함수로 Plan을 만들 수 있다. 호환 안 되는 배정은 violations로 세고, 비용은 「자원 없음」으로 둔다.
 */
export function buildPlan(method: Plan["method"], input: AllocInput, prep: Prepared[], assign: Map<string, string | null>, t0: number, fixedSet: Set<string> = new Set()): Plan {
  const { restore: d, params, now } = input;
  const rq = rqMin(d, params);
  const fixedAt = new Map(input.fixed.map((f) => [f.hid, f.approved_at] as const));
  let violations = 0;
  const rows: PlanRow[] = prep.map((x) => {
    const s = x.safe.s_low_engine_min;
    const rid = assign.get(x.h.id) ?? null;
    const cand = rid ? x.cands.find((k) => k.r.id === rid) ?? null : null;
    let arr: number | null = null, sup: number | null = null;
    let p_int = x.none.p_int, ei = x.none.ei_min;
    let arrived: PlanRow["arrived"] | undefined;
    let safe = x.safe;
    if (cand) {
      if (!cand.c.ok) violations++;
      arr = cand.arrival;
      sup = cand.supply;
      const at = fixedAt.get(x.h.id);
      if (at && fixedSet.has(x.h.id)) {
        const since = minutesBetween(at, now);
        if (cand.c.ok && since >= cand.arrival) {
          // 도착한 승인 전원(가정): 기기는 비상전원으로 돌고, 도착 때 남아 있던 기기 배터리는 공급이 끝난 뒤 쓴다.
          const atArr = addMinutes(at, cand.arrival);
          const battery = Math.max(0, safeTime(x.h, input.specs, atArr, params, input.weather).s_low_engine_min);
          const left = Math.max(0, cand.supply - (since - cand.arrival));
          arrived = { at: atArr, supply_left_min: left, battery_min: battery };
          arr = 0; sup = left;
          const eff = left + battery;
          safe = { ...x.safe, status: "value", s_low_min: eff, s_low_engine_min: eff };
        } else {
          arr = Math.max(0, arr - Math.max(0, since)); // 승인 뒤 이미 달려온 만큼
        }
      }
      if (cand.c.ok) {
        const k = arrived
          ? cost({ s_low: safe.s_low_engine_min, arrival: null, supply: null }, d)
          : cost({ s_low: s, arrival: arr, supply: sup }, d);
        p_int = k.p_int; ei = k.ei_min;
      }
    }
    const okArr = x.cands.filter((k) => k.c.ok).map((k) => k.arrival);
    const a_min = okArr.length ? Math.min(...okArr) : null;
    const excluded = x.cands.filter((k) => !k.c.ok).map((k) => ({
      rid: k.r.id, reason: k.c.reason as ExclusionReason, ...(k.c.need_w != null ? { need_w: k.c.need_w } : {}),
    }));
    const base = {
      hid: x.h.id, safe, rid: cand ? cand.r.id : null, arrival_min: arr, supply_min: sup,
      p_int, ei_min: ei, p_int0: arrived ? p_int : x.none.p_int, ei0_min: x.none.ei_min,
      rq_min: rq, a_min_min: a_min, margin_min: marginMin(safe.s_low_engine_min, rq, a_min), priority: 0,
      excluded, fixed: fixedSet.has(x.h.id),
    };
    if (arrived) return { ...base, lane: "main", arrived } as PlanRow;
    return { ...base, ...laneOf(base, d, params) } as PlanRow;
  });
  rows.sort(priorityCompare);
  rows.forEach((r, i) => (r.priority = i + 1));
  return {
    method, rows,
    expected_interrupted: rows.reduce((a, r) => a + r.p_int, 0),
    total_ei_min: rows.reduce((a, r) => a + r.ei_min, 0),
    solve_ms: nowMs() - t0, violations,
  };
}

/** 헝가리안 행렬: 가구 × (자원 + 가상열 가구 수). 호환 불가 칸 = 10¹⁴, 가상열 = 그 가구의 「자원 없음」 비용. */
export function costMatrix(rows: Prepared[], resIdx: number[], d: AllocInput["restore"]): number[][] {
  return rows.map((x) => {
    const line: number[] = resIdx.map((ri) => {
      const k = x.cands[ri];
      if (!k.c.ok) return INFEASIBLE;
      return cost({ s_low: x.safe.s_low_engine_min, arrival: k.arrival, supply: k.supply }, d).int_cost;
    });
    for (let j = 0; j < rows.length; j++) line.push(x.none.int_cost);
    return line;
  });
}

export interface AllocDebug { matrix: number[][]; picks: number[]; resIdx: number[] }

export function allocate(input: AllocInput, debug?: AllocDebug[]): Plan {
  const t0 = nowMs();
  const prep = prepare(input);
  const assign = new Map<string, string | null>();
  const fixedSet = new Set<string>();
  const usedR = new Set<string>();
  const hids = new Set(input.households.map((h) => h.id));
  const rids = new Set(input.resources.map((r) => r.id));
  for (const f of input.fixed) { // 승인 고정: 먼저 묶고 풀이에서 뺀다
    if (!hids.has(f.hid) || !rids.has(f.rid) || usedR.has(f.rid) || fixedSet.has(f.hid)) continue;
    assign.set(f.hid, f.rid); fixedSet.add(f.hid); usedR.add(f.rid);
  }
  const free = prep.filter((x) => !fixedSet.has(x.h.id));
  const resIdx = input.resources.map((r, i) => ({ r, i })).filter((z) => !usedR.has(z.r.id)).map((z) => z.i);
  if (free.length) {
    const matrix = costMatrix(free, resIdx, input.restore);
    const sol = hungarian(matrix);
    if (debug) debug.push({ matrix, picks: sol, resIdx });
    free.forEach((x, i) => {
      const j = sol[i];
      assign.set(x.h.id, j >= 0 && j < resIdx.length ? input.resources[resIdx[j]].id : null);
    });
  }
  return buildPlan("ours", input, prep, assign, t0, fixedSet);
}
