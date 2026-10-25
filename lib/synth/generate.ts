// 합성 가구·자원 생성기(구현명세 §6-7, 설계서 §5-3). 분포·비율은 전부 가정값.
// 평가 모드: truth(참값)와 observed(관측값)를 함께 만든다. 시나리오 모드: truth 없음(observed만).
import resourcesJson from "../../data/specs/resources.json";
import type { DeviceId, DeviceSpec, ExtBatterySpec, Household, HouseholdObserved, HouseholdTruth, ISO, Resource, ResourceType, SynthConfig } from "../types";
import { DEFAULT_PARAMS } from "../engine/params";
import { mulberry32, normal, pickWeighted, shuffled, unif, unifInt, type Rng } from "./rng";

export interface SynthSpecs { devices: DeviceSpec[]; ext: ExtBatterySpec[] }
type ResType = { type: ResourceType; label: string; output: Resource["output"]; cont_w: number | null; energy_wh: number | null; family?: string; rb_minutes?: number };
const RES_TYPES = resourcesJson.types as ResType[];
const RES_ORDER: ResourceType[] = ["PS_L", "PS_S", "ESS", "RB", "GEN"];

/** 기기 구성(설계서 §5-3): A계열 35 · B계열 15 · 거치형 산소 25 · 휴대용 산소 10 · 석션 10 · 기침유발 5. */
export const DEVICE_MIX: readonly (readonly [DeviceId, number])[] = [
  ["VENT_A", 35], ["VENT_B", 15], ["O2_STAT", 25], ["O2_PORT", 10], ["SUCTION", 10], ["COUGH", 5],
];
/** 관측 등급(설계서 §5-3): 기기 화면 값 40 · 보호자 입력만 40 · 모름 10 · 값 상충 10. */
type Grade = "screen" | "self" | "unknown" | "conflict";
const GRADE_MIX: readonly (readonly [Grade, number])[] = [["screen", 40], ["self", 40], ["unknown", 10], ["conflict", 10]];

const clip = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r2 = (x: number) => Math.round(x * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");

interface AreaGeo { name: string; cx: number; cy: number; r: number }
/** 구역 원: 1개면 가운데 큰 원, 여럿이면 가운데를 둘러싼 작은 원들(가상 배치도). */
export function areaGeometry(areas: string[], area_km: number): AreaGeo[] {
  const A = area_km, k = Math.max(1, areas.length);
  if (k === 1) return [{ name: areas[0] ?? "구역", cx: A / 2, cy: A / 2, r: A * 0.45 }];
  return areas.map((name, i) => {
    const th = -Math.PI / 2 + (2 * Math.PI * i) / k;
    return { name, cx: A / 2 + A * 0.27 * Math.cos(th), cy: A / 2 + A * 0.27 * Math.sin(th), r: A * 0.21 };
  });
}
function pointIn(r: Rng, g: AreaGeo): [number, number] {
  const rad = g.r * Math.sqrt(r()), th = 2 * Math.PI * r();
  return [r2(g.cx + rad * Math.cos(th)), r2(g.cy + rad * Math.sin(th))];
}

interface Forced { device?: DeviceId; grade?: Grade }

function genHousehold(r: Rng, id: string, geo: AreaGeo, specs: SynthSpecs, obsAt: ISO, eval_: boolean, f: Forced = {}): Household {
  let devId = f.device ?? pickWeighted(r, DEVICE_MIX);
  const grade: Grade = f.grade ?? pickWeighted(r, GRADE_MIX);
  if (grade === "conflict" && devId === "O2_STAT") devId = pickWeighted(r, DEVICE_MIX.filter(([d]) => d !== "O2_STAT"));
  const dev = specs.devices.find((d) => d.id === devId)!;
  const [x, y] = pointIn(r, geo);

  // 참값 배터리: 연수 y ∈ {0..3}, 용량 κ = clip(1 − 0.08y + N(0,0.05), 0.5, 1), 부하 λ ~ U(0,1), 충전 q ~ U(0.3,1.0)
  const years = unifInt(r, 0, 3);
  const kappa = clip(1 - 0.08 * years + 0.05 * normal(r), 0.5, 1.0);
  const lam = r();
  const runtime = dev.h_worst_min + lam * ((dev.h_std_min ?? dev.h_worst_min) - dev.h_worst_min);
  const q = unif(r, 0.3, 1.0);
  const isO2 = dev.h_worst_min <= 0;
  const battery = isO2 ? 0 : runtime * kappa * q;
  const spare = isO2 && r() < 0.5 ? Math.round(unif(r, 60, 180)) : 0;

  // 외장배터리: 30% 보유, 그중 절반 검증(목록 등록, 참값 사용 가능)·절반 미검증(참값 50% 확률 사용 가능)
  let ext: HouseholdObserved["ext"] = null;
  let extUsable = 0;
  if (!isO2 && r() < 0.3) {
    const es = specs.ext.find((e) => e.family === dev.family) ?? null;
    const verified = es != null && r() < 0.5;
    const c = unif(r, 0.3, 1.0);
    const charge: "full" | "half" | "unknown" = r() < 0.2 ? "unknown" : c >= 0.75 ? "full" : "half";
    if (verified) {
      extUsable = es!.h_worst_min * c;
      ext = { spec_id: es!.id, verified: true, charge, nominal_min: es!.h_worst_min };
    } else {
      const nominal = Math.round(unif(r, 120, 360) / 10) * 10;
      extUsable = r() < 0.5 ? nominal * c : 0;
      ext = { spec_id: null, verified: false, charge, nominal_min: nominal };
    }
  }

  const ageKnown = r() < 0.8;
  const obs: HouseholdObserved = {
    device_id: dev.id, device_match: dev.source === "assumed" ? "assumed" : "manual",
    age_years: ageKnown ? years : null, screen: null, self: null, ext, spare_o2_min: null,
  };
  if (isO2) {
    // 거치형 산소발생기: 배터리 값 없음. 예비 산소통이 있으면 보호자 입력(C). self.at은 입력 시각(충전 값은 쓰지 않음).
    if (spare > 0 && grade !== "unknown") { obs.spare_o2_min = Math.round(spare * unif(r, 0.7, 1.3)); obs.self = { charge: 1, at: obsAt }; }
  } else if (grade === "screen") {
    if (r() < 0.3) obs.screen = { kind: "percent", value: Math.round(clip(q * 100 * unif(r, 0.95, 1.05), 1, 100)), at: obsAt };
    else obs.screen = { kind: "minutes", value: Math.round(battery * unif(r, 0.95, 1.05)), at: obsAt };
  } else if (grade === "self") {
    obs.self = { charge: r2(clip(q * unif(r, 0.7, 1.3), 0.05, 1)), at: obsAt };
  } else if (grade === "conflict") {
    const b = Math.max(10, Math.round(battery * unif(r, 0.95, 1.05)));
    obs.screen = { kind: "minutes", value: b, at: obsAt };
    const af = obs.age_years == null ? DEFAULT_PARAMS.age_unknown_factor : Math.max(DEFAULT_PARAMS.age_floor, 1 - DEFAULT_PARAMS.age_per_year * obs.age_years);
    const per = dev.h_worst_min * (1 - DEFAULT_PARAMS.self_discount) * af; // 충전 1.0일 때 C 값
    let charge = clip(q * (r() < 0.5 ? unif(r, 0.3, 0.5) : unif(r, 1.6, 2.0)), 0.05, 1);
    if (Math.abs(b - per * charge) / b <= 0.35) charge = clip((0.5 * b) / per, 0.05, 1); // 크게 빗나가게 보장
    if (Math.abs(b - per * charge) / b <= 0.35) charge = 1; // 화면 값이 아주 작을 때
    obs.self = { charge: r2(charge), at: obsAt };
  }
  if (grade === "unknown" && r() < 0.5) { obs.device_id = null; obs.device_match = "unknown"; }

  const h: Household = { id, alias: id, x_km: x, y_km: y, area: geo.name, observed: obs };
  if (eval_) {
    const truth: HouseholdTruth = { device_id: dev.id, battery_min: Math.round(battery * 10) / 10, ext_usable_min: Math.round(extUsable * 10) / 10, spare_o2_min: spare };
    h.truth = truth;
  }
  return h;
}

function isUnknownObs(h: Household): boolean {
  const o = h.observed;
  if (o.device_id == null) return true;
  if (o.device_id === "O2_STAT") return false;
  return o.screen == null && o.self == null;
}
function isConflictObs(h: Household): boolean {
  return h.observed.device_id != null && h.observed.device_id !== "O2_STAT" && h.observed.screen != null && h.observed.self != null;
}

/** 거점(가상 위치): 구청 1 · 구역마다 주민센터 · 소방서 1 · 의료기기 대여업체 1. */
function makeBases(r: Rng, geos: AreaGeo[], A: number) {
  const inSq = (): [number, number] => [r2(unif(r, A * 0.1, A * 0.9)), r2(unif(r, A * 0.1, A * 0.9))];
  const multi = geos.length > 1;
  return {
    gu: { label: "구청(가상 위치)", xy: inSq() },
    centers: geos.map((g) => ({ label: multi ? `${g.name} 주민센터(가상 위치)` : "주민센터(가상 위치)", xy: pointIn(r, { ...g, r: g.r * 0.5 }) })),
    fire: { label: "소방서(가상 위치)", xy: inSq() },
    rental: { label: "의료기기 대여업체(가상)", xy: inSq() },
  };
}

export function generate(cfg: SynthConfig, specs: SynthSpecs): { households: Household[]; resources: Resource[] } {
  const r = mulberry32(cfg.seed);
  const evalMode = cfg.mode === "eval";
  const areas = cfg.areas.length ? cfg.areas : ["구역"];
  const geos = areaGeometry(areas, cfg.area_km);

  // 가구
  const fixed = cfg.fixed_households ?? [];
  const fixedIds = new Set(fixed.map((h) => h.id));
  const households: Household[] = [];
  for (let i = 0; i < cfg.n_households; i++) {
    const id = `H${pad(i + 1)}`;
    const g = geos[i % geos.length];
    const gen = genHousehold(r, id, g, specs, cfg.obs_at, evalMode);
    const fx = fixed.find((h) => h.id === id);
    households.push(fx ? { ...fx, observed: { ...fx.observed }, ...(evalMode ? {} : { truth: undefined }) } : gen);
  }
  for (const h of households) if (!evalMode) delete h.truth;

  // 시나리오 할당량(최소): 모름·값 상충·거치형 산소발생기를 1곳 이상(값은 생성기 그대로)
  if (cfg.quotas) {
    const special = new Set<string>();
    households.forEach((h) => { if (isUnknownObs(h) || isConflictObs(h) || h.observed.device_id === "O2_STAT") special.add(h.id); });
    const pool = shuffled(r, households.filter((h) => !fixedIds.has(h.id) && !special.has(h.id)).map((h) => h.id));
    const need: Forced[] = [];
    const count = (pred: (h: Household) => boolean) => households.filter(pred).length;
    for (let k = count(isUnknownObs); k < cfg.quotas.unknown; k++) need.push({ grade: "unknown" });
    for (let k = count(isConflictObs); k < cfg.quotas.conflict; k++) need.push({ grade: "conflict" });
    for (let k = count((h) => h.observed.device_id === "O2_STAT"); k < cfg.quotas.o2_stat; k++) need.push({ device: "O2_STAT", grade: "self" });
    for (const f of need) {
      const id = pool.shift();
      if (!id) break;
      const idx = households.findIndex((h) => h.id === id);
      const g = geos.find((z) => z.name === households[idx].area) ?? geos[0];
      let h = genHousehold(r, id, g, specs, cfg.obs_at, evalMode, f);
      for (let tries = 0; tries < 20 && f.grade === "unknown" && !isUnknownObs(h); tries++) h = genHousehold(r, id, g, specs, cfg.obs_at, evalMode, f);
      households[idx] = h;
    }
  }

  // 자원
  const bases = makeBases(r, geos, cfg.area_km);
  const resources: Resource[] = [];
  let n = 0;
  for (const type of RES_ORDER) {
    const cnt = cfg.resources[type] ?? 0;
    const t = RES_TYPES.find((z) => z.type === type)!;
    for (let k = 0; k < cnt; k++) {
      n++;
      let base: { label: string; xy: [number, number] };
      if (type === "PS_L") base = k % 2 === 0 ? bases.centers[(k / 2) % bases.centers.length] : bases.gu;
      else if (type === "PS_S") base = bases.centers[k % bases.centers.length];
      else if (type === "ESS") base = bases.gu;
      else if (type === "RB") base = bases.rental;
      else base = bases.fire;
      const res: Resource = {
        id: `R${pad(n)}`, type, label: cnt > 1 ? `${t.label} ${k + 1}` : t.label, base_label: base.label,
        x_km: base.xy[0], y_km: base.xy[1], available: r() < 0.9, soc: r2(unif(r, 0.5, 1.0)),
        output: t.output, cont_w: t.cont_w, energy_wh: t.energy_wh,
        ...(t.family ? { family: t.family } : {}), ...(t.rb_minutes != null ? { rb_minutes: t.rb_minutes } : {}),
      };
      resources.push(res);
    }
  }
  return { households, resources };
}

/** 평가 세트 설정(구현명세 §6-7): 소규모 가구 U{4..8}·도심 70% / 광역 가구 U{20..50}·도심 50%. 거점·가용·잔량은 generate가 정한다. */
export function evalConfig(seed: number, kind: "small" | "wide", obs_at: ISO = "2026-08-14T18:58:00+09:00"): SynthConfig {
  const r = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  if (kind === "small") {
    const urban = r() < 0.7;
    return { seed, mode: "eval", n_households: unifInt(r, 4, 8), urban, area_km: urban ? 3 : 12, areas: ["가상 구역"],
      resources: { PS_L: unifInt(r, 1, 3), PS_S: unifInt(r, 0, 1), ESS: unifInt(r, 0, 1), RB: unifInt(r, 0, 1), GEN: unifInt(r, 0, 1) }, obs_at };
  }
  const urban = r() < 0.5;
  return { seed, mode: "eval", n_households: unifInt(r, 20, 50), urban, area_km: urban ? 3 : 12, areas: ["가상 구역 1", "가상 구역 2", "가상 구역 3"],
    resources: { PS_L: unifInt(r, 2, 6), PS_S: unifInt(r, 1, 3), ESS: unifInt(r, 1, 3), RB: unifInt(r, 0, 2), GEN: unifInt(r, 0, 2) }, obs_at };
}
