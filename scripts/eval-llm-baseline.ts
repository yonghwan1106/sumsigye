// AI 챗봇 단독 배정 기준선 (구현명세 §5-5 끝) → data/eval/llm_baseline_runs.json
// 데이터 동결 뒤 1회만 실행한다: npm run eval:llm-baseline (키는 scripts/with-key.mjs로 자식 env에만)
// 30개 시나리오(소규모 1~15 + 광역 1001~1015) × {claude-haiku-5-5, claude-sonnet-5}. max_tokens 2,000, temperature 없음.
// JSON 파싱 실패 → 1회 재시도, 다시 실패 → 「응답 실패(전부 미배정)」. 끝난 (seed, model)은 건너뛴다(이어 하기).
// --dry: 키 없이 첫 시나리오 프롬프트만 출력. 그다음 npm run eval:alloc -- --merge-llm 이 같은 30개에서 ours·R1과 함께 채점한다.
import { writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { DeviceSpec } from "@/lib/types";
import { apiKeyPresent, callText } from "@/lib/llm/client";
import { ALLOC_MAX_TOKENS, ALLOC_SYSTEM_PROMPT, allocUserMessage, parseAllocResponse, type AllocPromptInput } from "@/lib/llm/allocPrompt";
import { prepare } from "@/lib/engine/allocate";
import { quantileRemaining } from "@/lib/engine/survival";
import { toKstIso } from "@/lib/engine/time";
import { ROOT, LLM_SEEDS, baseWorld, buildScenario, loadContext, readJson, type EvalScenario } from "./_evalset";

const MODELS = ["claude-haiku-5-5", "claude-sonnet-5"] as const;
const OUT = "data/eval/llm_baseline_runs.json";
const CONCURRENCY = 2;
const TIMEOUT_MS = 120000;

interface Run {
  seed: number; kind: "small" | "wide"; model: (typeof MODELS)[number];
  ok: boolean; parse_fail: boolean; attempts: number; call_errors: number; error_kinds?: string[];
  response_len: number; response: string; assignment: { household: string; resource: string | null }[];
  at: string;
}

const OUTPUT_LABEL = { AC_SINE: "정현파 AC", AC_UNKNOWN: "출력 파형 미확인", FAMILY: "전용 배터리" } as const;
const GRADE_LABEL = { A: "설명서 값", B: "기기 화면 값", C: "보호자 입력" } as const;

export function promptInput(sc: EvalScenario): AllocPromptInput {
  const prep = prepare(sc.input);
  const devs = sc.input.specs.devices;
  const label = (d: DeviceSpec | null) => (d ? d.label : "모름");
  return {
    households: prep.map((x) => ({
      id: x.h.id,
      device: label(x.dev),
      s_low: x.safe.status === "unknown" ? "모름" : String(Math.round(x.safe.s_low_engine_min)),
      grade: x.safe.grade ? GRADE_LABEL[x.safe.grade] : "모름",
    })),
    devices: devs.map((d) => ({
      label: d.label, rated_w: d.p_rated_w, peak_w: d.p_peak_w == null ? "미상" : String(d.p_peak_w),
      inputs: d.inputs.join("·"), family: d.family,
    })),
    resources: sc.input.resources.map((r) => ({
      id: r.id, type: r.label, output: OUTPUT_LABEL[r.output] + (r.family ? `(${r.family} 계열)` : ""),
      cont_w: r.cont_w == null ? "-" : String(r.cont_w), energy_wh: r.energy_wh == null ? (r.rb_minutes ? `${r.rb_minutes}분분` : "-") : String(r.energy_wh),
      soc: `${Math.round(r.soc * 100)}%`, available: r.available ? "가용" : "사용 불가",
    })),
    resource_ids: sc.input.resources.map((r) => r.id),
    arrival: prep.map((x) => ({ hid: x.h.id, mins: x.cands.map((c) => c.arrival) })),
    restore: {
      p50: quantileRemaining(sc.input.restore, 0.5),
      p80: quantileRemaining(sc.input.restore, 0.8),
      p90: quantileRemaining(sc.input.restore, 0.9),
    },
  };
}

async function runOne(sc: EvalScenario, model: Run["model"]): Promise<Run> {
  const user = allocUserMessage(promptInput(sc));
  let attempts = 0, callErrors = 0, last = "";
  const errorKinds: string[] = []; // invalid_output = 빈 글 또는 max_tokens에서 끊김, llm_error = 호출 예외(한도·네트워크)
  for (let k = 0; k < 2; k++) {
    attempts++;
    const r = await callText({ model, system: ALLOC_SYSTEM_PROMPT, user, maxTokens: ALLOC_MAX_TOKENS, timeoutMs: TIMEOUT_MS });
    if (!r.ok) {
      callErrors++;
      errorKinds.push(r.error);
      continue;
    }
    last = r.text;
    const parsed = parseAllocResponse(r.text);
    if (parsed) {
      return { seed: sc.seed, kind: sc.kind, model, ok: true, parse_fail: false, attempts, call_errors: callErrors, error_kinds: errorKinds, response_len: r.text.length, response: r.text, assignment: parsed, at: toKstIso(Date.now()) };
    }
  }
  return { seed: sc.seed, kind: sc.kind, model, ok: false, parse_fail: true, attempts, call_errors: callErrors, error_kinds: errorKinds, response_len: last.length, response: last, assignment: [], at: toKstIso(Date.now()) };
}

async function main() {
  if (process.argv.includes("--dry")) {
    // 키 없이 프롬프트만 확인(첫 시나리오)
    const sc = buildScenario(loadContext(), LLM_SEEDS[0], "small", baseWorld());
    console.log(allocUserMessage(promptInput(sc)));
    return;
  }
  if (!apiKeyPresent()) {
    console.error("eval-llm-baseline: ANTHROPIC_API_KEY not set (run via scripts/with-key.mjs)");
    process.exit(2);
  }
  const ctx = loadContext();
  const world = baseWorld();
  const prev: Run[] = existsSync(path.join(ROOT, OUT)) ? readJson<{ runs: Run[] }>(OUT).runs : [];
  const done = new Set(prev.filter((r) => r.ok || r.call_errors < r.attempts).map((r) => `${r.seed}:${r.model}`));
  const runs = prev.filter((r) => done.has(`${r.seed}:${r.model}`));
  const todo: { seed: number; model: Run["model"] }[] = [];
  for (const seed of LLM_SEEDS) for (const model of MODELS) if (!done.has(`${seed}:${model}`)) todo.push({ seed, model });
  console.log(`todo ${todo.length} (already ${runs.length}) · provisional=${ctx.provisional}`);

  const save = () =>
    writeFileSync(
      path.join(ROOT, OUT),
      JSON.stringify({
        meta: {
          built_at: toKstIso(Date.now()), seeds: LLM_SEEDS, models: MODELS, max_tokens: ALLOC_MAX_TOKENS,
          prompt: "prompts/llm_alloc_baseline.md", provisional: ctx.provisional, truth_source: ctx.truth_source,
          model_version: ctx.model.version,
        },
        runs: [...runs].sort((a, b) => a.seed - b.seed || a.model.localeCompare(b.model)),
      }, null, 1) + "\n",
      "utf8",
    );

  let i = 0;
  async function worker() {
    while (i < todo.length) {
      const t = todo[i++];
      const sc = buildScenario(ctx, t.seed, t.seed >= 1001 ? "wide" : "small", world);
      const run = await runOne(sc, t.model);
      runs.push(run);
      save(); // 증분 저장
      console.log(`${t.seed} ${t.model}: ${run.ok ? "ok" : "parse_fail"} (attempts ${run.attempts}, errors ${run.call_errors})`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  save();
  const fail = runs.filter((r) => r.parse_fail).length;
  console.log(`done: ${runs.length} runs, parse_fail ${fail}`);
}

main();
