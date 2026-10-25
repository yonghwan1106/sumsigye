// 서버 전용: 사전계산 시나리오 묶음(data/scenarios/*, C3)에서 첫 화면·/race·/poster의 두 막대 값을 계산한다.
// 값은 /ops와 같은 함수(components/ops/scenario.ts의 restoreAt·allocInput, lib/engine)에서만 나온다.
import sc1 from "@/data/scenarios/sc1.json";
import sc2 from "@/data/scenarios/sc2.json";
import sc3 from "@/data/scenarios/sc3.json";
import setsMeta from "@/data/eval/l4_sets_meta.json";
import type { ScenarioBundle } from "@/lib/types";
import { allocate } from "@/lib/engine/allocate";
import { baseline } from "@/lib/engine/baselines";
import { quantileRemaining } from "@/lib/engine/survival";
import { emptyState } from "@/lib/state/store";
import { allocInput, restoreAt, type SmsL1 } from "@/components/ops/scenario";

export type ScenarioId = "sc1" | "sc2" | "sc3";
export const BUNDLES: Record<ScenarioId, ScenarioBundle> = {
  sc1: sc1 as unknown as ScenarioBundle,
  sc2: sc2 as unknown as ScenarioBundle,
  sc3: sc3 as unknown as ScenarioBundle,
};

export function parseId(v: string | string[] | undefined): ScenarioId {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "sc2" || s === "sc3" ? s : "sc1";
}

export interface RaceValues {
  safe_min: number;
  r80_min: number;
  arrival_rule_min: number | null;
  arrival_ours_min: number | null;
  alias: string;
  source: "scenario" | "eval";
  eval_seed?: number;
  scenario: ScenarioId | null;
}

function smsL1(b: ScenarioBundle): SmsL1 {
  const out: SmsL1 = {};
  for (const [sn, v] of Object.entries(b.precomputed.l1)) out[sn] = { fields: v.fields, source: "precomputed" };
  return out;
}

/** 시나리오 판단 시점 1·기본 상태에서 쇼케이스 가구의 두 막대 값(쇼케이스가 없으면 null). */
export function scenarioRace(id: ScenarioId): RaceValues | null {
  const b = BUNDLES[id];
  if (!b.showcase.hid) return null;
  const s0 = emptyState(b.id, b.decision_points[0]);
  const dist = restoreAt(b, s0.now, smsL1(b));
  const ours = allocate(allocInput(b, s0, dist.d));
  const r1 = baseline("R1", allocInput(b, s0, dist.d, false));
  const o = ours.rows.find((r) => r.hid === b.showcase.hid);
  const q = r1.rows.find((r) => r.hid === b.showcase.hid);
  if (!o || !q) return null;
  const h = b.households.find((x) => x.id === b.showcase.hid);
  return {
    safe_min: o.safe.s_low_engine_min,
    r80_min: quantileRemaining(dist.d, 0.8),
    arrival_rule_min: q.arrival_min,
    arrival_ours_min: o.arrival_min,
    alias: h?.alias ?? b.showcase.hid,
    source: "scenario",
    scenario: id,
  };
}

/** 셋 다 쇼케이스가 없을 때: eval-alloc이 찾은 첫 평가 시나리오(§9 끝). */
export function evalRace(): RaceValues | null {
  const s = (setsMeta as unknown as { showcase_first: null | { seed: number; hid: string; alias: string; safe_min: number; r80_min: number; arrival_rule_min: number | null; arrival_ours_min: number | null } }).showcase_first;
  if (!s) return null;
  return { safe_min: s.safe_min, r80_min: s.r80_min, arrival_rule_min: s.arrival_rule_min, arrival_ours_min: s.arrival_ours_min, alias: s.alias, source: "eval", eval_seed: s.seed, scenario: null };
}

/** sc1 → sc2 → sc3 → 평가 시나리오 순서(설계서 §4-4-6). `prefer`가 있으면 그 시나리오를 먼저. */
export function heroRace(prefer?: ScenarioId): RaceValues | null {
  const order: ScenarioId[] = prefer ? [prefer, ...(["sc1", "sc2", "sc3"] as ScenarioId[]).filter((x) => x !== prefer)] : ["sc1", "sc2", "sc3"];
  for (const id of order) {
    const v = scenarioRace(id);
    if (v) return v;
  }
  return evalRace();
}
