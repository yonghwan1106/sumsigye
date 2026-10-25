// 사전계산 시나리오 (구현명세 §9) → data/scenarios/sc1.json·sc2.json·sc3.json + data/precomputed/api_cache.json
// 사용: npm run build:scenarios            (LLM을 새로 부르지 않는다 — llm_cache 적중만, 없으면 템플릿 + fallback:true)
//       node scripts/with-key.mjs --key-file <키 파일> -- npm run build:scenarios -- --llm   (메모·행동지침·빠진 L1을 haiku-5-5로 1회씩)
// 값은 §9 표에서 정한 것만 쓴다(결과를 보고 시드·가구 수를 바꾸지 않는다). 시각은 모두 실제 재난문자 기준.
// 계산은 /ops와 같은 함수(components/ops/scenario.ts의 compute·restoreAt, lib/engine)를 써서 화면과 같은 값이 나오게 한다.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type {
  Household, ISO, L1Resolved, L1Result, OutageEvent, RestoreModelFile, ScenarioBundle, ScenarioState, SmsRow,
} from "@/lib/types";
import { HOME } from "@/lib/copy";
import { generate } from "@/lib/synth/generate";
import { allocate } from "@/lib/engine/allocate";
import { baseline } from "@/lib/engine/baselines";
import { pickShowcase } from "@/lib/engine/showcase";
import { toKstIso } from "@/lib/engine/time";
import { finalize } from "@/lib/l1/validate";
import { ruleExtract } from "@/lib/l1/ruleExtract";
import { apiCacheKey, extractWithLlm, llmCacheKey } from "@/lib/l1/llmExtract";
import { apiKeyPresent, fallbackModel, realtimeModel, withFallback } from "@/lib/llm/client";
import { textKey, type ApiCacheFile } from "@/lib/llm/cache";
import { stateHash } from "@/lib/llm/stateHash";
import { BRIEF_SYSTEM_PROMPT, briefTemplate, briefUserMessage, briefWithModel, type BriefFacts } from "@/lib/llm/brief";
import { GUIDE_SYSTEM_PROMPT, guideChecklist, guideKey, guideUserMessage, guideWithModel, type GuideRequest } from "@/lib/llm/guide";
import { emptyState } from "@/lib/state/store";
import { SPECS, allocInput, compute, restoreAt, type SmsL1 } from "@/components/ops/scenario";
import { factRow, safeText } from "@/components/ops/display";
import { fmtClock, fmtMin } from "@/lib/format";
import { createHash } from "node:crypto";

const ROOT = path.resolve(__dirname, "..");
const USE_LLM = process.argv.includes("--llm");
const readJson = <T,>(rel: string): T => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8")) as T;
const exists = (rel: string) => existsSync(path.join(ROOT, rel));
function writeJson(rel: string, v: unknown) {
  const p = path.join(ROOT, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 1) + "\n", "utf8");
}
const T = (d: string, hm: string): ISO => `${d}T${hm.length === 5 ? hm + ":00" : hm}+09:00`;
const ms = (t: ISO) => Date.parse(t);

// ───────── §9 표 ─────────
interface Def {
  id: "sc1" | "sc2" | "sc3"; day: string; region: ScenarioBundle["region"]; start: string; first_sn: number;
  seed: number; n: number; quotas: { unknown: number; conflict: number; o2_stat: number };
  resources: Partial<Record<"PS_L" | "PS_S" | "ESS" | "RB" | "GEN", number>>;
  timeline: (["report", string, string, number?] | ["sms", number] | ["restored", string, string])[];
  decisions: string[]; obs: string; scripted?: boolean;
}
const DEFS: Def[] = [
  {
    id: "sc1", day: "2026-08-14", region: { sido: "서울특별시", sigungu: "마포구", areas: ["서교동"], urban: true, area_km: 3 },
    start: "18:52", first_sn: 266510, seed: 261101, n: 6, quotas: { unknown: 1, conflict: 1, o2_stat: 1 },
    resources: { PS_L: 1, PS_S: 1, ESS: 1, RB: 1, GEN: 1 },
    timeline: [["report", "18:56", "H01", 190], ["report", "18:58", "H03"], ["sms", 266510], ["restored", "22:40", "실제 복구 22:40(재난문자 기준)"], ["sms", 266511]],
    decisions: ["18:58", "20:19", "22:40"], obs: "18:58", scripted: true,
  },
  {
    id: "sc2", day: "2026-02-05", region: { sido: "경기도", sigungu: "안성시", areas: ["고삼면", "대덕면", "양성면"], urban: false, area_km: 12 },
    start: "03:20", first_sn: 254509, seed: 261102, n: 24, quotas: { unknown: 2, conflict: 2, o2_stat: 1 },
    resources: { PS_L: 3, PS_S: 2, ESS: 2, RB: 1, GEN: 2 },
    timeline: [["report", "03:26", "H02"], ["report", "03:31", "H07"], ["sms", 254509], ["sms", 254510], ["sms", 254516], ["restored", "07:08:36", "복구 문자 07:08(복구 시각은 문자에 없음)"], ["sms", 254517]],
    decisions: ["03:31", "05:18"], obs: "03:31",
  },
  {
    id: "sc3", day: "2026-08-18", region: { sido: "대전광역시", sigungu: "유성구", areas: ["복용동"], urban: true, area_km: 3 },
    start: "14:31", first_sn: 266838, seed: 261103, n: 8, quotas: { unknown: 1, conflict: 1, o2_stat: 1 },
    resources: { PS_L: 2, PS_S: 1, ESS: 1, GEN: 1 },
    timeline: [["report", "14:36", "H01"], ["report", "14:39", "H04"], ["sms", 266838], ["sms", 266843], ["sms", 266844], ["restored", "19:04:32", "복구 문자 19:04(복구 시각은 문자에 없음)"]],
    decisions: ["14:39", "16:57", "18:28"], obs: "14:39",
  },
];
const H01_SCRIPT = {
  observed: { device_id: "VENT_A" as const, device_match: "manual" as const, age_years: 2, screen: null, self: null, ext: null, spare_o2_min: null },
  persona: { guardian: "이정민(가명, 46세)", patient: "정순자(가명, 74세)", note: "루게릭병(ALS)으로 인공호흡기를 24시간 사용 — 가상 인물" },
};

// ───────── 입력 ─────────
const corpus = readJson<{ items: SmsRow[] }>("data/sms/corpus.json").items;
const bySn = new Map(corpus.map((r) => [r.sn, r] as const));
const model = readJson<RestoreModelFile>("data/model/restore_model.json");
const events: OutageEvent[] = exists("data/events/events.json") ? readJson<{ events: OutageEvent[] }>("data/events/events.json").events : [];
const haiku: L1Result[] = exists("data/l1/extract_haiku.json") ? readJson<{ items: L1Result[] }>("data/l1/extract_haiku.json").items : [];
const sonnet: L1Result[] = exists("data/l1/extract_sonnet.json") ? readJson<{ items: L1Result[] }>("data/l1/extract_sonnet.json").items : [];
const llmCachePath = "data/precomputed/llm_cache.json";
const llmCache = exists(llmCachePath)
  ? readJson<{ meta: Record<string, unknown>; items: Record<string, { lines?: string[]; fields?: L1Resolved; model: string; kind: string; at: string }> }>(llmCachePath)
  : { meta: {}, items: {} };
let llmCalls = 0;

function weatherOf(id: string): ScenarioBundle["weather"] {
  const rel = `data/weather/${id}.json`;
  if (!exists(rel)) return null;
  const w = readJson<{ attribution: string; note: string; hourly: { at: ISO; temp_c: number; precip_mm: number; wind_ms: number }[] } | null>(rel);
  return w && Array.isArray(w.hourly) ? { attribution: w.attribution, note: w.note, hourly: w.hourly } : null;
}

const RAW_KEYS = ["relevant", "kind", "place_text", "areas", "occurred_clock", "eta", "restored_clock", "cause6", "scale_hint", "evidence"] as const;
function rawOf(f: L1Resolved) {
  const o: Record<string, unknown> = {};
  for (const k of RAW_KEYS) o[k] = f[k];
  return o as unknown as Parameters<typeof finalize>[0];
}

/** 시나리오 문자 L1: extract_haiku.json → llm_cache → (--llm) haiku-5-5 1회 호출. 없으면 빠진다(화면은 규칙 추출). */
async function scenarioL1(sn: number): Promise<{ model: "claude-haiku-5-5"; fields: L1Resolved } | null> {
  const h = haiku.find((x) => x.sn === sn);
  if (h) return { model: "claude-haiku-5-5", fields: h.fields };
  const row = bySn.get(sn);
  if (!row) return null;
  const key = llmCacheKey("claude-haiku-5-5", row.text, row.sent_at);
  const c = llmCache.items[key];
  if (c?.fields) return { model: "claude-haiku-5-5", fields: c.fields };
  if (!USE_LLM || !apiKeyPresent()) return null;
  llmCalls++;
  const r = await extractWithLlm(row.text, { model: "claude-haiku-5-5", timeoutMs: 30000 });
  if (!r.ok) return null;
  const fields = finalize(r.raw, { text: row.text, sent_at: row.sent_at });
  llmCache.items[key] = { fields, model: r.model, kind: "l1", at: toKstIso(Date.now()) };
  return { model: "claude-haiku-5-5", fields };
}

// 열쇠에 시스템 프롬프트를 넣어 프롬프트가 바뀌면 예전 결과를 쓰지 않는다.
const textCacheKey = (kind: "brief" | "guide", user: string) => {
  const sys = kind === "brief" ? BRIEF_SYSTEM_PROMPT : GUIDE_SYSTEM_PROMPT;
  return createHash("sha256").update(`${realtimeModel()}\n${kind}\n${sys}\n${user}`).digest("hex");
};

async function briefLines(facts: BriefFacts): Promise<{ lines: string[]; model: string; fallback: boolean }> {
  const key = textCacheKey("brief", briefUserMessage(facts));
  const c = llmCache.items[key];
  if (c?.lines) return { lines: c.lines, model: c.model, fallback: false };
  if (USE_LLM && apiKeyPresent()) {
    llmCalls++;
    const g = await withFallback([realtimeModel(), fallbackModel()], async (m) => {
      const r = await briefWithModel(facts, m);
      return r.ok ? { ...r, error: undefined } : { ...r, error: r.fallback_reason };
    });
    if (g.ok) {
      llmCache.items[key] = { lines: g.lines, model: g.model, kind: "brief", at: toKstIso(Date.now()) };
      return { lines: g.lines, model: g.model, fallback: false };
    }
  }
  return { lines: briefTemplate(facts), model: "template", fallback: true };
}

async function guideLines(req: GuideRequest): Promise<{ lines: string[]; model: string; fallback: boolean }> {
  const key = textCacheKey("guide", guideUserMessage(req));
  const c = llmCache.items[key];
  if (c?.lines) return { lines: c.lines, model: c.model, fallback: false };
  if (USE_LLM && apiKeyPresent()) {
    llmCalls++;
    const g = await withFallback([realtimeModel(), fallbackModel()], async (m) => {
      const r = await guideWithModel(req, m);
      return r.ok ? { ...r, error: undefined } : { ...r, error: r.fallback_reason };
    });
    if (g.ok) {
      llmCache.items[key] = { lines: g.lines, model: g.model, kind: "guide", at: toKstIso(Date.now()) };
      return { lines: g.lines, model: g.model, fallback: false };
    }
  }
  return { lines: guideChecklist(req.device_id), model: "checklist", fallback: true };
}

function restoreModelFor(eventId: string, night: boolean): ScenarioBundle["restore_model"] {
  const loo = model.loo.find((l) => l.event_id === eventId);
  const cells_small: Record<string, boolean> = {};
  const usesGroup = model.selected === "M2";
  const n = night ? "night" : "day";
  for (const g of ["G1", "G2", "G3", "all"] as const) {
    const cell = model.cells.find((c) => (c.group === "all" || !usesGroup || c.group === g) && (c.night === "all" || c.night === night));
    cells_small[`${g}|${n}`] = cell?.small ?? false;
  }
  if (loo && !model.provisional) return { source: "loo", model: loo.model, coef: loo.coef, sigma: loo.sigma, cells_small };
  const sel = model.models[model.selected] ?? model.models.M0;
  return { source: model.provisional ? "provisional" : "full", model: model.selected, coef: sel.coef, sigma: sel.sigma, cells_small };
}

function isNight(t: ISO): boolean {
  const h = new Date(ms(t) + 9 * 3600000).getUTCHours();
  return h >= 22 || h < 6;
}

async function buildBundle(def: Def): Promise<ScenarioBundle> {
  const obsAt = T(def.day, def.obs);
  const cfgBase = {
    seed: def.seed, mode: "scenario" as const, n_households: def.n, urban: def.region.urban, area_km: def.region.area_km,
    areas: def.region.areas, resources: def.resources, quotas: def.quotas, obs_at: obsAt,
  };
  let gen = generate(cfgBase, SPECS);
  if (def.scripted) {
    // 각본 가구 H01: 위치·구역은 생성기 값 그대로, 관측값·인물만 각본(난수 흐름이 같아 나머지 가구 값은 바뀌지 않는다)
    const g0 = gen.households.find((h) => h.id === "H01")!;
    const H01: Household = { ...g0, observed: { ...H01_SCRIPT.observed }, persona: { ...H01_SCRIPT.persona } };
    gen = generate({ ...cfgBase, fixed_households: [H01] }, SPECS);
  }

  const timeline: ScenarioBundle["timeline"] = [];
  for (const t of def.timeline) {
    if (t[0] === "report") {
      const at = T(def.day, t[1]);
      timeline.push({ at, type: "report", hid: t[2], ...(t[3] != null ? { screen: { kind: "minutes" as const, value: t[3], at } } : {}) });
    } else if (t[0] === "sms") {
      const r = bySn.get(t[1]);
      if (!r) throw new Error(`sms ${t[1]} not in corpus`);
      timeline.push({ at: r.sent_at, type: "sms", sn: r.sn, text: r.text, org: r.org ?? "" });
    } else {
      timeline.push({ at: T(def.day, t[1]), type: "restored", label: t[2] });
    }
  }
  timeline.sort((a, b) => ms(a.at) - ms(b.at));

  const ev = events.find((e) => e.sns.includes(def.first_sn));
  const event_id = ev?.event_id ?? `E-${def.first_sn}`;
  const outage_start = ev?.start_at ?? T(def.day, def.start);
  let actual: ScenarioBundle["actual"];
  if (ev && ev.outcome === "exact" && ev.duration_h != null) actual = { kind: "exact", restored_at: toKstIso(ms(outage_start) + ev.duration_h * 3600000) };
  else if (ev && ev.outcome === "interval" && ev.lower_h != null && ev.upper_h != null) {
    actual = { kind: "interval", lower_at: toKstIso(ms(outage_start) + ev.lower_h * 3600000), upper_at: toKstIso(ms(outage_start) + ev.upper_h * 3600000) };
  } else {
    throw new Error(`event for sn ${def.first_sn} missing or not exact/interval`);
  }

  const l1: ScenarioBundle["precomputed"]["l1"] = {};
  for (const e of timeline) if (e.type === "sms") {
    const x = await scenarioL1(e.sn);
    if (x) l1[String(e.sn)] = x;
  }
  const card = HOME.scenarioCards[def.id];
  const bundle: ScenarioBundle = {
    id: def.id, title: card.title, card_line: card.line, region: def.region, outage_start, event_id, actual,
    restore_model: restoreModelFor(event_id, isNight(outage_start)), weather: weatherOf(def.id),
    households: gen.households, resources: gen.resources, seed: def.seed, timeline,
    decision_points: def.decisions.map((d) => T(def.day, d)),
    precomputed: { l1, briefs: {}, guides: {} },
    showcase: { hid: null, source: "scenario" }, built_at: toKstIso(Date.now()), provisional: model.provisional,
  };
  return bundle;
}

/** 화면(components/ops/loadScenario.ts)과 같은 규칙: 사전계산 L1이 있으면 그것, 없으면 규칙 추출. */
function smsL1Of(b: ScenarioBundle): SmsL1 {
  const out: SmsL1 = {};
  for (const e of b.timeline) if (e.type === "sms") {
    const pre = b.precomputed.l1[String(e.sn)];
    out[String(e.sn)] = pre
      ? { fields: pre.fields, source: "precomputed" }
      : { fields: finalize(ruleExtract({ text: e.text, sent_at: e.at, org: e.org }), { text: e.text, sent_at: e.at }), source: "rule" };
  }
  return out;
}

async function precompute(b: ScenarioBundle) {
  const smsL1 = smsL1Of(b);
  for (let i = 0; i < b.decision_points.length; i++) {
    const s: ScenarioState = emptyState(b.id, b.decision_points[i]);
    const hash = await stateHash({ scenario: b.id, decision_index: i, approvals: s.approvals, overrides: s.overrides });
    const c = compute(b, s, smsL1);
    if (c.restored) continue; // 복구된 판단 시점은 행·메모를 보이지 않는다(배정 재계산 멈춤)
    const alias = new Map(c.households.map((h) => [h.id, h] as const));
    const changedAliases = [...c.changed].map((hid) => alias.get(hid)?.alias ?? hid);
    const rows = c.plan.rows.map((r) => factRow(r, alias.get(r.hid)!.alias, alias.get(r.hid)!.observed.device_id, b.resources));
    // 판단 시점 메모 1개(상위 3가구) + 행 펼침 메모(가구마다)
    b.precomputed.briefs[hash] = await briefLines({ rows: rows.slice(0, 3), changed: changedAliases, now: fmtClock(s.now) });
    for (const r of rows) b.precomputed.briefs[`${hash}:${r.alias}`] = await briefLines({ rows: [r], changed: changedAliases, now: fmtClock(s.now) });
  }
  // 쇼케이스: 판단 시점 1, 기본 상태에서 pickShowcase(숨시계 vs 단순 규칙 R1)
  const s0 = emptyState(b.id, b.decision_points[0]);
  const dist = restoreAt(b, s0.now, smsL1);
  const ours = allocate(allocInput(b, s0, dist.d));
  const r1 = baseline("R1", allocInput(b, s0, dist.d, false));
  b.showcase = { hid: pickShowcase(ours, r1, dist.d), source: "scenario" };

  // 행동지침: sc1 H01 — 승인 대기·승인됨·전원 없음(판단 시점 1 기본 상태 값)
  if (b.id === "sc1") {
    const row = ours.rows.find((r) => r.hid === "H01");
    if (row) {
      const safe = safeText(row.safe);
      const arrival = row.arrival_min != null ? fmtMin(row.arrival_min) : null;
      for (const status of ["pending", "approved", "none"] as const) {
        const req: GuideRequest = { device_id: "VENT_A", safe, status, arrival: status === "approved" ? arrival : null };
        b.precomputed.guides[guideKey(req)] = await guideLines(req);
      }
    }
  }
}

async function main() {
  const t0 = Date.now();
  const bundles: ScenarioBundle[] = [];
  for (const def of DEFS) {
    const b = await buildBundle(def);
    await precompute(b);
    bundles.push(b);
  }
  // 셋 다 쇼케이스가 없으면 eval-alloc이 찾은 첫 평가 시나리오(§9 끝)
  if (bundles.every((b) => !b.showcase.hid) && exists("data/eval/l4_sets_meta.json")) {
    const sm = readJson<{ showcase_first: { seed: number } | null }>("data/eval/l4_sets_meta.json").showcase_first;
    if (sm) for (const b of bundles) b.showcase = { hid: null, source: "eval", eval_seed: sm.seed };
  }
  for (const b of bundles) writeJson(`data/scenarios/${b.id}.json`, b);

  // /api/extract 사전계산: 코퍼스 문자의 haiku-5-5(실시간 모델) 결과 우선, 없으면 sonnet-5
  const api: ApiCacheFile = { meta: { built_at: toKstIso(Date.now()), n_extract: 0, n_brief: 0, n_guide: 0 }, extract: {}, text_index: {}, briefs: {}, guides: {} };
  for (const [items, m] of [[sonnet, "claude-sonnet-5"], [haiku, "claude-haiku-5-5"]] as const) {
    for (const it of items) {
      const row = bySn.get(it.sn);
      if (!row) continue;
      const k = apiCacheKey(row.text, row.sent_at);
      api.extract[k] = { sn: it.sn, sent_at: row.sent_at, model: m, raw: rawOf(it.fields), fields: it.fields };
      api.text_index[textKey(row.text)] = k;
    }
  }
  for (const b of bundles) {
    Object.assign(api.briefs, b.precomputed.briefs);
    Object.assign(api.guides, b.precomputed.guides);
  }
  api.meta.n_extract = Object.keys(api.extract).length;
  api.meta.n_brief = Object.keys(api.briefs).length;
  api.meta.n_guide = Object.keys(api.guides).length;
  writeJson("data/precomputed/api_cache.json", api);
  llmCache.meta = { ...llmCache.meta, built_at: toKstIso(Date.now()), n: Object.keys(llmCache.items).length };
  writeJson(llmCachePath, llmCache);

  for (const b of bundles) {
    const nb = Object.keys(b.precomputed.briefs).length;
    const fb = Object.values(b.precomputed.briefs).filter((x) => x.fallback).length;
    console.log(`${b.id}: households ${b.households.length}, resources ${b.resources.length}, event ${b.event_id} (${b.actual.kind}), model ${b.restore_model.source}/${b.restore_model.model}, l1 ${Object.keys(b.precomputed.l1).length}, briefs ${nb} (fallback ${fb}), guides ${Object.keys(b.precomputed.guides).length}, showcase ${b.showcase.hid ?? "-"} (${b.showcase.source})`);
  }
  console.log(`api_cache: extract ${api.meta.n_extract}, briefs ${api.meta.n_brief}, guides ${api.meta.n_guide} · llm calls ${llmCalls} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
