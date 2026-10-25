// 시나리오 묶음 + 브라우저 상태 → 엔진 입력·출력(/ops·/home 공용, 클라이언트에서 돈다).
// 순위·배정·시간 계산은 lib/engine이 하고, 여기서는 각본 사건·운영자/보호자 입력을 엔진 입력으로 옮길 뿐이다.
import devicesJson from "@/data/specs/devices.json";
import extJson from "@/data/specs/ext_batteries.json";
import { allocate } from "@/lib/engine/allocate";
import { baseline } from "@/lib/engine/baselines";
import { DEFAULT_PARAMS } from "@/lib/engine/params";
import { muOf, quantileRemaining, survRemaining } from "@/lib/engine/survival";
import { minutesBetween } from "@/lib/engine/time";
import { stateHash as stateHashC } from "@/lib/llm/stateHash";
import { GROUP_OF, type AllocInput, type CauseGroup, type Household, type HouseholdObserved, type ISO, type L1Resolved, type Plan, type RestoreDist, type ScenarioBundle, type ScenarioState } from "@/lib/types";

export const SPECS = { devices: devicesJson.devices, ext: extJson.ext } as unknown as AllocInput["specs"];

export type SmsL1 = Record<string, { fields: L1Resolved; source: "precomputed" | "rule" }>;
export type SmsEvent = Extract<ScenarioBundle["timeline"][number], { type: "sms" }>;
export type ReportEvent = Extract<ScenarioBundle["timeline"][number], { type: "report" }>;

const ms = (t: ISO) => Date.parse(t);

/** 야간 = 발생 22~06시(설계서 §4-2). */
export function isNight(t: ISO): boolean {
  const h = new Date(ms(t) + 9 * 3600000).getUTCHours();
  return h >= 22 || h < 6;
}

export function arrivedSms(b: ScenarioBundle, now: ISO): SmsEvent[] {
  return b.timeline.filter((e): e is SmsEvent => e.type === "sms" && ms(e.at) <= ms(now));
}

/** 각본 신고(now 이전) + /home 신고. */
export function reportsUpTo(b: ScenarioBundle, s: ScenarioState): { hid: string; at: ISO }[] {
  const out = b.timeline.filter((e): e is ReportEvent => e.type === "report" && ms(e.at) <= ms(s.now)).map((e) => ({ hid: e.hid, at: e.at }));
  for (const r of s.reports) if (ms(r.at) <= ms(s.now) && !out.some((o) => o.hid === r.hid)) out.push(r);
  return out.sort((a, b2) => ms(a.at) - ms(b2.at));
}

/** 각본 사건(신고 때 화면 값)을 now가 지나면 적용하고, /home·전화 확인 입력(overrides)이 이긴다. */
export function effectiveHouseholds(b: ScenarioBundle, s: ScenarioState): Household[] {
  return b.households.map((h) => {
    let obs: HouseholdObserved = { ...h.observed };
    for (const e of b.timeline) {
      if (e.type === "report" && e.hid === h.id && e.screen && ms(e.at) <= ms(s.now)) obs = { ...obs, screen: e.screen };
    }
    const ov = s.overrides[h.id];
    if (ov) obs = { ...obs, ...ov };
    return { ...h, observed: obs };
  });
}

/** 칸 표본 적음 조회(키 형식이 정해지지 않아 몇 가지 표기를 받는다). M0은 칸을 쓰지 않으므로 false. */
function cellSmall(b: ScenarioBundle, group: CauseGroup, night: boolean): boolean {
  const rm = b.restore_model;
  if (rm.model === "M0") return false;
  const g = rm.model === "M1" ? "all" : group;
  const n = night ? "night" : "day";
  const keys = [`${g}|${n}`, `${g}:${n}`, `${g}_${n}`, `${g}|${night}`, `${g}:${night}`, `${g}_${night}`, `${g}-${n}`];
  for (const k of keys) if (k in rm.cells_small) return !!rm.cells_small[k];
  return false;
}

export interface DistInfo { d: RestoreDist; group: CauseGroup; night: boolean; small: boolean; elapsed_min: number }

/** 남은 복구시간 분포: 문자 도착 전 원인군 G3(미상), 도착 뒤 L1 원인의 군. 야간 = 시작 시각 기준. */
export function restoreAt(b: ScenarioBundle, now: ISO, l1: SmsL1, cutoff?: ISO): DistInfo {
  const lim = cutoff ?? now;
  let group: CauseGroup = "G3";
  for (const e of arrivedSms(b, lim)) {
    const f = l1[String(e.sn)]?.fields;
    if (f && f.relevant && f.cause6 !== "unknown") group = GROUP_OF[f.cause6];
  }
  const night = isNight(b.outage_start);
  const small = cellSmall(b, group, night);
  const elapsed = Math.max(0, minutesBetween(b.outage_start, now));
  const mu = muOf(b.restore_model.coef, group, night);
  return { d: { kind: "lognormal", mu, sigma: b.restore_model.sigma, elapsed_min: elapsed, small_cell: small }, group, night, small, elapsed_min: elapsed };
}

export function weatherAt(b: ScenarioBundle, now: ISO): { precip_mm: number; wind_ms: number; temp_c: number } | null {
  const hs = b.weather?.hourly;
  if (!hs || !hs.length) return null;
  let best = hs[0];
  for (const h of hs) if (ms(h.at) <= ms(now)) best = h;
  return { precip_mm: best.precip_mm, wind_ms: best.wind_ms, temp_c: best.temp_c };
}

export function allocInput(b: ScenarioBundle, s: ScenarioState, dist: RestoreDist, withFixed = true): AllocInput {
  return {
    households: effectiveHouseholds(b, s), resources: b.resources, specs: SPECS, now: s.now, urban: b.region.urban,
    restore: dist, weather: weatherAt(b, s.now),
    fixed: withFixed ? s.approvals.map((a) => ({ hid: a.hid, rid: a.rid, approved_at: a.approved_at })) : [],
    params: DEFAULT_PARAMS,
  };
}

/** 단순 규칙(R1) — C의 lib/engine/baselines.ts baseline("R1")을 그대로 쓴다. */
export function baselineR1(input: AllocInput): Plan {
  return baseline("R1", input);
}

/** 복구 확인: 각본의 복구 사건(실제 복구) 또는 복구 문자(L1 kind = restoration)가 now 이전에 왔는가. */
export interface RestoredInfo {
  /** 복구 시각(문자에 시각이 있으면 그 시각, 없으면 복구 문자 수신 시각) */
  at: ISO;
  basis: "sms_time" | "sms_received";
  /** 화면이 복구를 알게 된 시각 */
  known_at: ISO;
}

export function restoredInfo(b: ScenarioBundle, now: ISO, l1: SmsL1): RestoredInfo | null {
  let best: RestoredInfo | null = null;
  const take = (x: RestoredInfo) => { if (!best || ms(x.known_at) < ms(best.known_at)) best = x; };
  for (const e of b.timeline) {
    if (ms(e.at) > ms(now)) continue;
    if (e.type === "restored") {
      if (b.actual.kind === "exact") take({ at: b.actual.restored_at, basis: "sms_time", known_at: e.at });
      else take({ at: e.at, basis: "sms_received", known_at: e.at });
    } else if (e.type === "sms") {
      const f = l1[String(e.sn)]?.fields;
      if (f && f.relevant && f.kind === "restoration") {
        take(f.restored_at && ms(f.restored_at) <= ms(e.at)
          ? { at: f.restored_at, basis: "sms_time", known_at: e.at }
          : { at: e.at, basis: "sms_received", known_at: e.at });
      }
    }
  }
  return best;
}

export interface Computed {
  households: Household[]; dist: DistInfo; plan: Plan; r1: Plan;
  /** 가장 최근 문자 도착으로 제안이 바뀐 가구(승인 안 된 행만) */
  changed: Set<string>;
  r80: number; p50: number; p90: number;
  /** 복구됨이면 배정 재계산·복구 예측을 멈추고, plan·r1·분포는 복구 전 마지막 판단 시점(frozen_at) 값으로 둔다. */
  restored: RestoredInfo | null;
  frozen_at: ISO | null;
}

export function compute(b: ScenarioBundle, s: ScenarioState, l1: SmsL1): Computed {
  const rest = restoredInfo(b, s.now, l1);
  if (rest) {
    const before = b.decision_points.filter((t) => ms(t) < ms(rest.at));
    const firstReport = b.timeline.find((e) => e.type === "report")?.at ?? b.outage_start;
    const anchor = before.length ? before[before.length - 1] : firstReport;
    const sF: ScenarioState = { ...s, now: anchor, approvals: s.approvals.filter((a) => ms(a.approved_at) <= ms(anchor)) };
    const c = computeOpen(b, sF, l1);
    return { ...c, changed: new Set<string>(), restored: rest, frozen_at: anchor };
  }
  return computeOpen(b, s, l1);
}

function computeOpen(b: ScenarioBundle, s: ScenarioState, l1: SmsL1): Computed {
  const dist = restoreAt(b, s.now, l1);
  const input = allocInput(b, s, dist.d);
  const plan = allocate(input);
  const r1 = baselineR1(allocInput(b, s, dist.d, false));
  // 바뀐 행: 가장 최근에 도착한 문자 직전의 판단 시점(없으면 첫 신고 시각)에 같은 승인·입력으로 낸 제안과 비교
  const changed = new Set<string>();
  const arr = arrivedSms(b, s.now);
  if (arr.length) {
    const last = arr[arr.length - 1];
    const prevPoints = b.decision_points.filter((t) => ms(t) < ms(last.at));
    const firstReport = b.timeline.find((e) => e.type === "report")?.at ?? b.outage_start;
    const anchor = prevPoints.length ? prevPoints[prevPoints.length - 1] : firstReport;
    const sPrev: ScenarioState = { ...s, now: anchor, approvals: s.approvals.filter((a) => ms(a.approved_at) <= ms(anchor)) };
    const prevDist = restoreAt(b, anchor, l1);
    const prev = allocate(allocInput(b, sPrev, prevDist.d));
    const pm = new Map(prev.rows.map((r) => [r.hid, r.rid] as const));
    const approved = new Set(s.approvals.map((a) => a.hid));
    for (const r of plan.rows) if (!approved.has(r.hid) && (pm.get(r.hid) ?? null) !== (r.rid ?? null)) changed.add(r.hid);
  }
  return {
    households: input.households, dist, plan, r1, changed,
    r80: quantileRemaining(dist.d, 0.8), p50: quantileRemaining(dist.d, 0.5), p90: quantileRemaining(dist.d, 0.9),
    restored: null, frozen_at: null,
  };
}

/** 기관 예고: 가장 최근 문자 중 예고가 있는 것. */
export function latestEta(b: ScenarioBundle, now: ISO, l1: SmsL1): { eta_at: ISO | null; eta_range: [ISO, ISO] | null; sn: number } | null {
  const arr = arrivedSms(b, now);
  for (let i = arr.length - 1; i >= 0; i--) {
    const f = l1[String(arr[i].sn)]?.fields;
    if (f && (f.eta_at || f.eta_range)) return { eta_at: f.eta_at, eta_range: f.eta_range, sn: arr[i].sn };
  }
  return null;
}

/** P(남은 복구 > 예고 시각 − now). */
export function probBeyond(d: RestoreDist, now: ISO, at: ISO): number {
  return survRemaining(d, Math.max(0, minutesBetween(now, at)));
}

/** 상태 해시 = sha256(정렬 JSON {scenario, decision_index, approvals, overrides}) 앞 16자(구현명세 §6-9) — C의 lib/llm/stateHash와 같은 함수. */
export async function stateHash(b: ScenarioBundle, s: ScenarioState): Promise<string> {
  const decision_index = b.decision_points.findIndex((t) => ms(t) === ms(s.now));
  try { return await stateHashC({ scenario: b.id, decision_index, approvals: s.approvals, overrides: s.overrides }); } catch { return ""; }
}
