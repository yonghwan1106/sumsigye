// 임시: C3(build-scenarios)의 data/scenarios/sc*.json이 생기기 전까지 쓰는 같은 스키마의 시나리오 묶음.
// 값은 구현명세 §9 표 그대로(시드·가구 수·할당량·자원·타임라인·판단 시점). 서버에서만 import한다(코퍼스 원문을 읽음).
// TODO(owner C): data/scenarios/sc*.json이 생기면 loadScenario.ts가 그 파일을 쓰고 이 파일은 지운다.
import corpusJson from "@/data/sms/corpus.json";
import restoreJson from "@/data/model/restore_model.json";
import w1 from "@/data/weather/sc1.json";
import w2 from "@/data/weather/sc2.json";
import w3 from "@/data/weather/sc3.json";
import { generate } from "@/lib/synth/generate";
import { allocate } from "@/lib/engine/allocate";
import { pickShowcase } from "@/lib/engine/showcase";
import type { Household, ISO, RestoreModelFile, ScenarioBundle, ScenarioState, SmsRow } from "@/lib/types";
import { HOME } from "@/lib/copy";
import { SPECS, allocInput, baselineR1Temp, restoreAt } from "./scenario";
import { emptyStateFor } from "./stateInit";

const corpus = (corpusJson as unknown as { items: SmsRow[] }).items;
const RM = restoreJson as unknown as RestoreModelFile;
const T = (d: string, hm: string): ISO => `${d}T${hm.length === 5 ? hm + ":00" : hm}+09:00`;
function sms(sn: number) {
  const r = corpus.find((x) => x.sn === sn);
  if (!r) return null;
  return { at: r.sent_at, type: "sms" as const, sn, text: r.text, org: r.org ?? "" };
}

interface Def {
  id: "sc1" | "sc2" | "sc3"; day: string; region: ScenarioBundle["region"]; start: string; first_sn: number;
  actual: ScenarioBundle["actual"]; seed: number; n: number; quotas: { unknown: number; conflict: number; o2_stat: number };
  resources: Partial<Record<"PS_L" | "PS_S" | "ESS" | "RB" | "GEN", number>>;
  timeline: (["report", string, string, number?] | ["sms", number] | ["restored", string, string])[];
  decisions: string[]; obs: string; scripted?: boolean;
}

const DEFS: Def[] = [
  {
    id: "sc1", day: "2026-08-14", region: { sido: "서울특별시", sigungu: "마포구", areas: ["서교동"], urban: true, area_km: 3 },
    start: "18:52", first_sn: 266510, actual: { kind: "exact", restored_at: "2026-08-14T22:40:00+09:00" },
    seed: 261101, n: 6, quotas: { unknown: 1, conflict: 1, o2_stat: 1 }, resources: { PS_L: 1, PS_S: 1, ESS: 1, RB: 1, GEN: 1 },
    timeline: [["report", "18:56", "H01", 190], ["report", "18:58", "H03"], ["sms", 266510], ["restored", "22:40", "실제 복구 22:40(재난문자 기준)"], ["sms", 266511]],
    decisions: ["18:58", "20:19", "22:40"], obs: "18:58", scripted: true,
  },
  {
    id: "sc2", day: "2026-02-05", region: { sido: "경기도", sigungu: "안성시", areas: ["고삼면", "대덕면", "양성면"], urban: false, area_km: 12 },
    start: "03:20", first_sn: 254509, actual: { kind: "interval", lower_at: "2026-02-05T05:23:14+09:00", upper_at: "2026-02-05T07:08:36+09:00" },
    seed: 261102, n: 24, quotas: { unknown: 2, conflict: 2, o2_stat: 1 }, resources: { PS_L: 3, PS_S: 2, ESS: 2, RB: 1, GEN: 2 },
    timeline: [["report", "03:26", "H02"], ["report", "03:31", "H07"], ["sms", 254509], ["sms", 254510], ["sms", 254516], ["restored", "07:08:36", "복구 문자 07:08(복구 시각은 문자에 없음)"], ["sms", 254517]],
    decisions: ["03:31", "05:18"], obs: "03:31",
  },
  {
    id: "sc3", day: "2026-08-18", region: { sido: "대전광역시", sigungu: "유성구", areas: ["복용동"], urban: true, area_km: 3 },
    start: "14:31", first_sn: 266838, actual: { kind: "interval", lower_at: "2026-08-18T18:27:09+09:00", upper_at: "2026-08-18T19:04:32+09:00" },
    seed: 261103, n: 8, quotas: { unknown: 1, conflict: 1, o2_stat: 1 }, resources: { PS_L: 2, PS_S: 1, ESS: 1, GEN: 1 },
    timeline: [["report", "14:36", "H01"], ["report", "14:39", "H04"], ["sms", 266838], ["sms", 266843], ["sms", 266844], ["restored", "19:04:32", "복구 문자 19:04(복구 시각은 문자에 없음)"]],
    decisions: ["14:39", "16:57", "18:28"], obs: "14:39",
  },
];

const WEATHER: Record<string, { attribution: string; note: string; hourly: { at: ISO; temp_c: number; precip_mm: number; wind_ms: number }[] }> = { sc1: w1, sc2: w2, sc3: w3 };

const cache = new Map<string, ScenarioBundle>();

export function buildStubScenario(id: "sc1" | "sc2" | "sc3"): ScenarioBundle {
  const hit = cache.get(id);
  if (hit) return hit;
  const def = DEFS.find((d) => d.id === id)!;
  const obsAt = T(def.day, def.obs);
  const cfgBase = {
    seed: def.seed, mode: "scenario" as const, n_households: def.n, urban: def.region.urban, area_km: def.region.area_km,
    areas: def.region.areas, resources: def.resources, quotas: def.quotas, obs_at: obsAt,
  };
  let households: Household[];
  let resources;
  if (def.scripted) {
    // 각본 가구 H01: 위치는 생성기 값을 그대로 쓰고 관측값만 각본으로(난수 흐름이 같아 나머지 값은 바뀌지 않는다)
    const first = generate(cfgBase, SPECS);
    const g0 = first.households.find((h) => h.id === "H01")!;
    const H01: Household = {
      ...g0,
      observed: { device_id: "VENT_A", device_match: "manual", age_years: 2, screen: null, self: null, ext: null, spare_o2_min: null },
      persona: { guardian: "이정민(가명, 46세)", patient: "정순자(가명, 74세)", note: "루게릭병(ALS)으로 인공호흡기를 24시간 사용 — 가상 인물" },
    };
    const g = generate({ ...cfgBase, fixed_households: [H01] }, SPECS);
    households = g.households; resources = g.resources;
  } else {
    const g = generate(cfgBase, SPECS);
    households = g.households; resources = g.resources;
  }
  const timeline: ScenarioBundle["timeline"] = [];
  for (const t of def.timeline) {
    if (t[0] === "report") {
      const at = T(def.day, t[1]);
      timeline.push({ at, type: "report", hid: t[2], ...(t[3] != null ? { screen: { kind: "minutes" as const, value: t[3], at } } : {}) });
    } else if (t[0] === "sms") {
      const e = sms(t[1]);
      if (e) timeline.push(e);
    } else timeline.push({ at: T(def.day, t[1]), type: "restored", label: t[2] });
  }
  timeline.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const event_id = `E-${def.first_sn}`;
  const loo = RM.loo.find((l) => l.event_id === event_id);
  const sel = RM.models[RM.selected] ?? RM.models.M0;
  const restore_model: ScenarioBundle["restore_model"] = loo
    ? { source: "loo", model: loo.model, coef: loo.coef, sigma: loo.sigma, cells_small: {} }
    : { source: RM.provisional ? "provisional" : "full", model: RM.selected, coef: sel.coef, sigma: sel.sigma, cells_small: {} };
  const card = HOME.scenarioCards[id];
  const bundle: ScenarioBundle = {
    id, title: card.title, card_line: card.line, region: def.region,
    outage_start: T(def.day, def.start), event_id, actual: def.actual, restore_model, weather: WEATHER[id] ? { attribution: WEATHER[id].attribution, note: WEATHER[id].note, hourly: WEATHER[id].hourly } : null,
    households, resources, seed: def.seed, timeline, decision_points: def.decisions.map((d) => T(def.day, d)),
    precomputed: { l1: {}, briefs: {}, guides: {} },
    showcase: { hid: null, source: "scenario" }, built_at: new Date().toISOString(), provisional: true,
  };
  // 쇼케이스: 판단 시점 1, 기본 상태에서 pickShowcase
  const s0: ScenarioState = emptyStateFor(bundle);
  const dist = restoreAt(bundle, s0.now, {});
  const ours = allocate(allocInput(bundle, s0, dist.d));
  const r1 = baselineR1Temp(allocInput(bundle, s0, dist.d, false));
  bundle.showcase = { hid: pickShowcase(ours, r1, dist.d), source: "scenario" };
  cache.set(id, bundle);
  return bundle;
}
