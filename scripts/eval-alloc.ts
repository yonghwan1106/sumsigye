// L4 몬테카를로 평가 (구현명세 §5-5) → data/eval/l4_results.json · l4_sensitivity.json · l4_sets_meta.json
// 사용: npm run eval:alloc [-- --merge-llm] [-- --no-sens] [-- --quick]
//  --merge-llm : data/eval/llm_baseline_runs.json(AI 챗봇 단독, 30개)을 같은 시나리오에서 ours·R1과 함께 채점
//  --quick     : 개발용(소규모·광역 각 20개, 부트스트랩 200) — 결과 파일에 quick 표시. 제출용으로 쓰지 않는다.
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Agg, L4Results, L4Sensitivity, Method, Plan } from "@/lib/types";
import { allocate } from "@/lib/engine/allocate";
import { baseline, planFromAssignment } from "@/lib/engine/baselines";
import { scoreTruth, type ScoreDetail } from "@/lib/engine/score";
import { pickShowcase } from "@/lib/engine/showcase";
import { quantileRemaining } from "@/lib/engine/survival";
import { DEFAULT_PARAMS } from "@/lib/engine/params";
import { mulberry32 } from "@/lib/synth/rng";
import { toKstIso } from "@/lib/engine/time";
import { LAB } from "@/lib/copy";
import {
  ROOT, SMALL_SEEDS, WIDE_SEEDS, LLM_SEEDS, baseWorld, buildScenario, loadContext, readJson,
  type EvalContext, type EvalScenario, type EvalWorld,
} from "./_evalset";

const args = process.argv.slice(2);
const MERGE_LLM = args.includes("--merge-llm");
const NO_SENS = args.includes("--no-sens");
const QUICK = args.includes("--quick");
const BOOT = QUICK ? 200 : 2000;
const BOOT_SENS = QUICK ? 100 : 1000;
const smallSeeds = QUICK ? SMALL_SEEDS.slice(0, 20) : SMALL_SEEDS;
const wideSeeds = QUICK ? WIDE_SEEDS.slice(0, 20) : WIDE_SEEDS;

const METHODS: Method[] = ["R1", "R2", "R3", "A1", "ours", "ORACLE"];

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function percentile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** 시나리오 재표집 부트스트랩 평균의 95% 구간. idx는 미리 뽑은 재표집 색인(짝 비교가 같은 색인을 쓰게). */
function bootCI(xs: number[], idx: number[][]): [number, number] {
  if (xs.length === 0) return [0, 0];
  const ms = idx.map((ii) => mean(ii.map((i) => xs[i]))).sort((a, b) => a - b);
  return [r3(percentile(ms, 0.025)), r3(percentile(ms, 0.975))];
}

function bootIndex(n: number, B: number, seed: number): number[][] {
  const r = mulberry32(seed);
  return Array.from({ length: B }, () => Array.from({ length: n }, () => Math.floor(r() * n) % n));
}

interface Rec { seed: number; kind: "small" | "wide"; s: Record<string, ScoreDetail>; solve_ms_ours: number }

function runScenario(sc: EvalScenario, methods: Method[], world: EvalWorld): { rec: Rec; plans: Record<string, Plan> } {
  const plans: Record<string, Plan> = {};
  const s: Record<string, ScoreDetail> = {};
  for (const m of methods) {
    const p = m === "ours" ? allocate(sc.input) : baseline(m, sc.input, { truthRemaining_min: sc.truthR });
    plans[m] = p;
    s[m] = scoreTruth(p, sc.input, sc.truthR, world.truth);
  }
  return { rec: { seed: sc.seed, kind: sc.kind, s, solve_ms_ours: plans.ours?.solve_ms ?? 0 }, plans };
}

function agg(recs: Rec[], m: string, idx: number[][]): Agg {
  const xs = recs.map((r) => r.s[m].interrupted);
  const assigned = recs.reduce((a, r) => a + r.s[m].assigned, 0);
  const unk = recs.reduce((a, r) => a + r.s[m].unknown_assigned, 0);
  return {
    interrupted_mean: r3(mean(xs)),
    ci: bootCI(xs, idx),
    ei_mean: r3(mean(recs.map((r) => r.s[m].interruption_min))),
    violations_mean: r3(mean(recs.map((r) => r.s[m].violations))),
    energy_short_mean: r3(mean(recs.map((r) => r.s[m].energy_short))),
    unknown_share: r3(assigned ? unk / assigned : 0),
  };
}

function diff(recs: Rec[], a: string, b: string, idx: number[][]): { mean: number; ci: [number, number] } {
  const xs = recs.map((r) => r.s[a].interrupted - r.s[b].interrupted);
  return { mean: r3(mean(xs)), ci: bootCI(xs, idx) };
}

function writeJson(rel: string, v: unknown) {
  const p = path.join(ROOT, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 1) + "\n", "utf8");
}

function sensWorlds(): { key: keyof typeof LAB.sens; world: EvalWorld }[] {
  const P = DEFAULT_PARAMS;
  const both = (key: string, over: Partial<typeof P>): EvalWorld => ({ key, engine: { ...P, ...over }, truth: { ...P, ...over }, tail_mult: 1, test_only: false });
  const engineOnly = (key: string, over: Partial<typeof P>): EvalWorld => ({ key, engine: { ...P, ...over }, truth: P, tail_mult: 1, test_only: false });
  return [
    { key: "base", world: baseWorld() },
    { key: "tail15", world: { ...baseWorld(), key: "tail15", tail_mult: 1.5 } },
    { key: "test_only", world: { ...baseWorld(), key: "test_only", test_only: true } },
    // 보호자 입력 감가·노후 감가는 엔진의 추정 규칙이다(참값 배터리 생성기는 그대로) → 엔진만 바꾼다.
    { key: "self_lo", world: engineOnly("self_lo", { self_discount: 0.075 }) },
    { key: "self_hi", world: engineOnly("self_hi", { self_discount: 0.225 }) },
    { key: "age_lo", world: engineOnly("age_lo", { age_per_year: 0.05 }) },
    { key: "age_hi", world: engineOnly("age_hi", { age_per_year: 0.15 }) },
    // 이동 속도·출동 준비는 엔진과 참값 세계를 같이 바꾼다.
    { key: "speed_lo", world: both("speed_lo", { speed_urban_kmh: P.speed_urban_kmh * 0.5, speed_rural_kmh: P.speed_rural_kmh * 0.5 }) },
    { key: "speed_hi", world: both("speed_hi", { speed_urban_kmh: P.speed_urban_kmh * 1.5, speed_rural_kmh: P.speed_rural_kmh * 1.5 }) },
    { key: "prep_lo", world: both("prep_lo", { prep_min: 5 }) },
    { key: "prep_hi", world: both("prep_hi", { prep_min: 15 }) },
    // 불일치: 엔진은 기본 속도, 실제만 ×0.5
    { key: "mismatch", world: { key: "mismatch", engine: P, truth: { ...P, speed_urban_kmh: P.speed_urban_kmh * 0.5, speed_rural_kmh: P.speed_rural_kmh * 0.5 }, tail_mult: 1, test_only: false } },
  ];
}

interface LlmRun {
  seed: number; model: "claude-haiku-5-5" | "claude-sonnet-5"; ok: boolean; parse_fail: boolean;
  assignment: { household: string; resource: string | null }[];
}

function mergeLlm(ctx: EvalContext): L4Results["llm"] {
  const file = path.join(ROOT, "data/eval/llm_baseline_runs.json");
  if (!existsSync(file)) return null;
  const runs = readJson<{ runs: LlmRun[] }>("data/eval/llm_baseline_runs.json").runs;
  const world = baseWorld();
  const scen = new Map<number, EvalScenario>();
  for (const seed of LLM_SEEDS) scen.set(seed, buildScenario(ctx, seed, seed >= 1001 ? "wide" : "small", world));
  const idx = bootIndex(LLM_SEEDS.length, BOOT, 7);
  const rows: NonNullable<L4Results["llm"]>["rows"] = [];
  const base: Record<string, number[]> = { ours: [], R1: [] };
  const baseViol: Record<string, number> = { ours: 0, R1: 0 };
  for (const seed of LLM_SEEDS) {
    const sc = scen.get(seed)!;
    for (const m of ["ours", "R1"] as const) {
      const p = m === "ours" ? allocate(sc.input) : baseline("R1", sc.input);
      const s = scoreTruth(p, sc.input, sc.truthR, world.truth);
      base[m].push(s.interrupted);
      baseViol[m] += s.violations;
    }
  }
  for (const m of ["ours", "R1"] as const) {
    rows.push({ id: m, n: LLM_SEEDS.length, parse_fail: 0, interrupted_mean: r3(mean(base[m])), ci: bootCI(base[m], idx), violations_total: baseViol[m] });
  }
  const okOnly: NonNullable<NonNullable<L4Results["llm"]>["ok_only"]> = [];
  for (const [model, id] of [["claude-haiku-5-5", "LLM_HAIKU"], ["claude-sonnet-5", "LLM_SONNET"]] as const) {
    const xs: number[] = [];
    const ok = { llm: [] as number[], ours: [] as number[], r1: [] as number[] };
    let fail = 0, viol = 0, n = 0;
    for (const [si, seed] of LLM_SEEDS.entries()) {
      const run = runs.find((r) => r.seed === seed && r.model === model);
      if (!run) continue;
      n++;
      const sc = scen.get(seed)!;
      if (run.parse_fail) fail++;
      const { plan, dropped } = planFromAssignment(id, sc.input, run.parse_fail ? [] : run.assignment);
      const s = scoreTruth(plan, sc.input, sc.truthR, world.truth);
      xs.push(s.interrupted);
      viol += s.violations + dropped;
      if (!run.parse_fail) { ok.llm.push(s.interrupted); ok.ours.push(base.ours[si]); ok.r1.push(base.R1[si]); }
    }
    if (n === 0) continue;
    okOnly.push({ id, n: ok.llm.length, llm: r3(mean(ok.llm)), ours: r3(mean(ok.ours)), r1: r3(mean(ok.r1)) });
    rows.push({ id, n, parse_fail: fail, interrupted_mean: r3(mean(xs)), ci: n === LLM_SEEDS.length ? bootCI(xs, idx) : bootCI(xs, bootIndex(n, BOOT, 7)), violations_total: viol });
  }
  return { subset_seeds: LLM_SEEDS, rows, ok_only: okOnly };
}

function main() {
  const t0 = Date.now();
  const ctx = loadContext();
  const world = baseWorld();
  const recs: Rec[] = [];
  const setMeta: Record<string, unknown>[] = [];
  let showcase: Record<string, unknown> | null = null;

  for (const [kind, seeds] of [["small", smallSeeds], ["wide", wideSeeds]] as const) {
    for (const seed of seeds) {
      const sc = buildScenario(ctx, seed, kind, world);
      const { rec, plans } = runScenario(sc, METHODS, world);
      recs.push(rec);
      const cnt: Record<string, number> = {};
      for (const r of sc.input.resources) cnt[r.type] = (cnt[r.type] ?? 0) + 1;
      setMeta.push({
        seed, kind, n_households: sc.input.households.length, resources: cnt, urban: sc.input.urban,
        event_id: sc.event_id, elapsed_min: r3(sc.elapsed_min), group: sc.group, night: sc.night,
        truth_remaining_min: r3(sc.truthR), draws: sc.draws,
      });
      if (!showcase) {
        const hid = pickShowcase(plans.ours, plans.R1, sc.input.restore);
        if (hid) {
          const o = plans.ours.rows.find((x) => x.hid === hid)!;
          const q = plans.R1.rows.find((x) => x.hid === hid)!;
          showcase = {
            seed, kind, hid, alias: hid,
            safe_min: r3(o.safe.s_low_engine_min), r80_min: r3(quantileRemaining(sc.input.restore, 0.8)),
            arrival_rule_min: q.arrival_min == null ? null : r3(q.arrival_min),
            arrival_ours_min: o.arrival_min == null ? null : r3(o.arrival_min),
          };
        }
      }
    }
    console.log(`${kind}: ${seeds.length} scenarios (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }

  const scopes = {
    small: recs.filter((r) => r.kind === "small"),
    wide: recs.filter((r) => r.kind === "wide"),
    all: recs,
  } as const;
  const idx = {
    small: bootIndex(scopes.small.length, BOOT, 7),
    wide: bootIndex(scopes.wide.length, BOOT, 7),
    all: bootIndex(scopes.all.length, BOOT, 7),
  };

  const results: L4Results = {
    status: ctx.provisional || QUICK ? "measuring" : "final",
    provisional: ctx.provisional,
    meta: { n_small: 200, n_wide: 200, truth_pool: "loo_pair", boot: 2000 },
    methods: METHODS.map((m) => ({
      id: m, label: LAB.methods[m as keyof typeof LAB.methods],
      small: agg(scopes.small, m, idx.small), wide: agg(scopes.wide, m, idx.wide), all: agg(scopes.all, m, idx.all),
    })),
    diffs: [],
    llm: MERGE_LLM ? mergeLlm(ctx) : null,
    compute_ms_wide: r3(mean(scopes.wide.map((r) => r.solve_ms_ours))),
  };
  for (const [a, b] of [["R1", "ours"], ["A1", "ours"], ["ours", "ORACLE"]] as const) {
    for (const scope of ["small", "wide", "all"] as const) {
      const d = diff(scopes[scope], a, b, idx[scope]);
      results.diffs.push({ a, b, scope, mean: d.mean, ci: d.ci });
    }
  }
  // 스키마 밖 보조 정보(화면은 읽지 않아도 된다)
  const extra = {
    truth_source: ctx.truth_source,
    pool_n: ctx.pool.length,
    model_selected: ctx.model.selected,
    model_version: ctx.model.version,
    quick: QUICK,
    n_small_run: scopes.small.length,
    n_wide_run: scopes.wide.length,
    boot_run: BOOT,
    built_at: toKstIso(Date.now()),
  };
  writeJson("data/eval/l4_results.json", { ...results, meta: { ...results.meta, ...extra } });
  console.log(`l4_results.json written (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  writeJson("data/eval/l4_sets_meta.json", {
    built_at: extra.built_at, truth_source: ctx.truth_source, provisional: ctx.provisional, pool_n: ctx.pool.length,
    pool_event_ids: ctx.pool.map((e) => e.event_id), showcase_first: showcase, sets: setMeta,
  });

  if (!NO_SENS) {
    const rows: L4Sensitivity["rows"] = [];
    for (const { key, world: w } of sensWorlds()) {
      const sr: Rec[] = [];
      for (const [kind, seeds] of [["small", smallSeeds], ["wide", wideSeeds]] as const) {
        for (const seed of seeds) sr.push(runScenario(buildScenario(ctx, seed, kind, w), ["R1", "ours"], w).rec);
      }
      const ix = bootIndex(sr.length, BOOT_SENS, 7);
      const d = diff(sr, "R1", "ours", ix);
      rows.push({
        key, label: LAB.sens[key],
        ours: r3(mean(sr.map((r) => r.s.ours.interrupted))), r1: r3(mean(sr.map((r) => r.s.R1.interrupted))),
        diff: d.mean, ci: d.ci,
      });
      console.log(`sens ${key}: R1-ours ${d.mean} [${d.ci.join(", ")}] (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
    const sens: L4Sensitivity = { status: results.status, rows };
    writeJson("data/eval/l4_sensitivity.json", { ...sens, provisional: ctx.provisional, n: smallSeeds.length + wideSeeds.length, boot: BOOT_SENS, quick: QUICK });
  }
  const all = results.methods.map((m) => `${m.id} ${m.all.interrupted_mean} [${m.all.ci.join(", ")}]`).join(" | ");
  console.log(`done ${((Date.now() - t0) / 1000).toFixed(1)}s · provisional=${ctx.provisional} · ${all}`);
}

main();
