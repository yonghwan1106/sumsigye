// L4 평가 시나리오 만들기 (구현명세 §5-5) — eval-alloc.ts·eval-llm-baseline.ts·build-scenarios.ts(쇼케이스 대체)가 같이 쓴다.
// 참값 복구시간 = LOO 짝 부트스트랩(정확·구간 사건 j를 뽑아 그 지속시간), 배정기 분포 = 사건 j를 뺀 LOO 모수.
// 사건표·LOO 모수가 아직 없으면(임시 모형) 임시 M0 분포에서 참값을 뽑고 provisional로 표시한다.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type {
  AllocInput, CauseGroup, DeviceSpec, EngineParams, ExtBatterySpec, OutageEvent, RestoreDist, RestoreModelFile,
} from "@/lib/types";
import { DEFAULT_PARAMS } from "@/lib/engine/params";
import { lnSurv, muOf, normInv } from "@/lib/engine/survival";
import { evalConfig, generate } from "@/lib/synth/generate";
import { mulberry32, unif } from "@/lib/synth/rng";

export const ROOT = path.resolve(__dirname, "..");
export const SMALL_SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
export const WIDE_SEEDS = Array.from({ length: 200 }, (_, i) => i + 1001);
export const LLM_SEEDS = [...SMALL_SEEDS.slice(0, 15), ...WIDE_SEEDS.slice(0, 15)];
export const TEST_SPLIT_AT = Date.parse("2026-07-01T00:00:00+09:00");

export function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, rel), "utf8")) as T;
}

export interface EvalContext {
  specs: { devices: DeviceSpec[]; ext: ExtBatterySpec[] };
  model: RestoreModelFile;
  /** 정확·구간 사건 가운데 LOO 모수가 있는 것 */
  pool: OutageEvent[];
  looById: Map<string, RestoreModelFile["loo"][number]>;
  provisional: boolean;
  truth_source: "events_loo" | "provisional_model";
}

export function loadContext(): EvalContext {
  const devices = readJson<{ devices: DeviceSpec[] }>("data/specs/devices.json").devices;
  const ext = readJson<{ ext: ExtBatterySpec[] }>("data/specs/ext_batteries.json").ext;
  const model = readJson<RestoreModelFile>("data/model/restore_model.json");
  const looById = new Map(model.loo.map((l) => [l.event_id, l] as const));
  let pool: OutageEvent[] = [];
  if (existsSync(path.join(ROOT, "data/events/events.json"))) {
    const ev = readJson<{ events: OutageEvent[] }>("data/events/events.json").events;
    pool = ev.filter((e) => (e.outcome === "exact" || e.outcome === "interval") && looById.has(e.event_id));
  }
  const usable = pool.length > 0 && !model.provisional;
  return {
    specs: { devices, ext },
    model,
    pool: usable ? pool : [],
    looById,
    provisional: model.provisional || !usable,
    truth_source: usable ? "events_loo" : "provisional_model",
  };
}

export interface EvalWorld {
  key: string;
  /** 엔진이 쓰는 가정값 */
  engine: EngineParams;
  /** 참값 세계(도착·공급 채점)의 가정값 */
  truth: EngineParams;
  tail_mult: number;
  test_only: boolean;
}

export function baseWorld(): EvalWorld {
  return { key: "base", engine: DEFAULT_PARAMS, truth: DEFAULT_PARAMS, tail_mult: 1, test_only: false };
}

export interface EvalScenario {
  seed: number;
  kind: "small" | "wide";
  input: AllocInput;
  truthR: number;
  event_id: string | null;
  elapsed_min: number;
  group: CauseGroup;
  night: boolean;
  duration_min: number;
  draws: number;
}

function smallCell(model: RestoreModelFile, group: CauseGroup, night: boolean): boolean {
  if (model.selected === "M0") return false;
  const usesGroup = model.selected === "M2";
  const cell = model.cells.find(
    (c) => (c.group === "all" || !usesGroup || c.group === group) && (c.night === "all" || c.night === night),
  );
  return cell?.small ?? false;
}

/** 조건부 로그정규 참값(시간): T | T > e. */
function drawCondLognormal(r: () => number, mu: number, sigma: number, eH: number): number {
  const se = lnSurv(mu, sigma, eH);
  const u = Math.min(1 - 1e-9, Math.max(1e-9, r()));
  return Math.exp(mu + sigma * normInv(1 - (1 - u) * se));
}

export function buildScenario(ctx: EvalContext, seed: number, kind: "small" | "wide", world: EvalWorld): EvalScenario {
  const cfg = evalConfig(seed, kind);
  const { households, resources } = generate(cfg, ctx.specs);
  const r = mulberry32((seed * 2654435761 + 0x2545f491) >>> 0);
  const pool = world.test_only ? ctx.pool.filter((e) => e.start_at && Date.parse(e.start_at) >= TEST_SPLIT_AT) : ctx.pool;

  let restore: RestoreDist;
  let truthR = 0, e = 0, d = 0, draws = 0;
  let group: CauseGroup = "G3";
  let night = false;
  let event_id: string | null = null;

  if (pool.length > 0) {
    for (draws = 1; draws <= 50; draws++) {
      const j = pool[Math.floor(r() * pool.length) % pool.length];
      if (r() < 0.5) {
        e = unif(r, 5, 15);
        group = "G3";
      } else {
        e = j.first_sms_delay_min != null && j.first_sms_delay_min > 0 ? j.first_sms_delay_min : unif(r, 30, 120);
        group = j.group;
      }
      const dh = j.outcome === "exact" ? (j.duration_h ?? 0) : unif(r, j.lower_h ?? 0, j.upper_h ?? j.lower_h ?? 0);
      d = dh * 60 * world.tail_mult;
      night = j.night;
      event_id = j.event_id;
      if (d > e) break;
    }
    if (d <= e) d = e + 1;
    const loo = ctx.looById.get(event_id!)!;
    restore = { kind: "lognormal", mu: muOf(loo.coef, group, night), sigma: loo.sigma, elapsed_min: e, small_cell: smallCell(ctx.model, group, night) };
  } else {
    // 임시: 사건표·LOO 모수 없음 → 임시 M0에서 참값을 뽑는다(배정기도 같은 M0).
    const m0 = ctx.model.models[ctx.model.selected] ?? ctx.model.models.M0;
    const mu = muOf(m0.coef, "G3", false);
    e = r() < 0.5 ? unif(r, 5, 15) : unif(r, 30, 120);
    d = drawCondLognormal(r, mu, m0.sigma, e / 60) * 60 * world.tail_mult;
    draws = 1;
    restore = { kind: "lognormal", mu, sigma: m0.sigma, elapsed_min: e, small_cell: false };
  }
  truthR = d - e;

  const input: AllocInput = {
    households, resources, specs: ctx.specs, now: cfg.obs_at, urban: cfg.urban, restore,
    weather: null, fixed: [], params: world.engine,
  };
  return { seed, kind, input, truthR, event_id, elapsed_min: e, group, night, duration_min: d, draws };
}
