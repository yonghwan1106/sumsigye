// P5·P9 LLM 오프라인 추출(구현명세 §4-5). 키는 scripts/with-key.mjs가 자식 환경변수로만 넘긴다.
// 사용: npm run data:llm -- --model claude-sonnet-5 --split dev
//       npm run data:llm -- --model claude-haiku-5-5 --split fixtures
//       npm run data:llm -- --model claude-haiku-5-5 --split gold,fixtures   (검수 반영 A9 커밋 뒤에만)
// 결과는 dates.resolve·validate를 거쳐 data/l1/extract_{sonnet|haiku}.json에 합쳐 저장한다(이미 있는 캐시 키는 부르지 않는다).
// 문안·응답을 출력하지 않는다(건수만).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { L1ExtractFile, L1Result, L1Source, SmsRow } from "../lib/types";
import { extractWithLlm, llmCacheKey } from "../lib/l1/llmExtract";
import { finalize } from "../lib/l1/validate";

const ROOT = join(__dirname, "..");
const nowIso = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(" ", "T") + "+09:00";
const FILE_OF: Record<string, string> = { "claude-sonnet-5": "extract_sonnet.json", "claude-haiku-5-5": "extract_haiku.json" };
const CONCURRENCY = 4;
const TIMEOUT_MS = 30000;   // 오프라인(사전계산)은 실시간 12초보다 길게 둔다

type Item = L1Result & { cache_key: string };
type OutFile = Omit<L1ExtractFile, "items"> & { items: Item[]; meta: L1ExtractFile["meta"] & { failures?: { sn: number; error: string }[]; calls?: number } };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const model = arg("--model");
  const splits = (arg("--split") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!model || !FILE_OF[model] || splits.length === 0 || splits.some((s) => !["dev", "gold", "fixtures"].includes(s))) {
    console.error("usage: extract-llm --model claude-sonnet-5|claude-haiku-5-5 --split dev|gold|fixtures[,..]");
    process.exit(2);
  }
  if (!process.env.ANTHROPIC_API_KEY) { console.error("extract-llm: no key in environment (use scripts/with-key.mjs)"); process.exit(3); }

  // 골드 LLM 추출은 응모자 검수 반영(l1_gold.json reviewed_n > 0) 뒤에만 — 커밋 순서 증빙(§4 P8·P9)
  if (splits.includes("gold")) {
    const gp = join(ROOT, "data", "eval", "l1_gold.json");
    const g = existsSync(gp) ? JSON.parse(readFileSync(gp, "utf8")) : null;
    if (!g || !(g.meta?.reviewed_n > 0)) {
      console.error(`extract-llm: gold split refused — l1_gold.json reviewed_n=${g?.meta?.reviewed_n ?? "none"} (ingest the applicant review and commit E1-A9 first)`);
      process.exit(4);
    }
  }

  const corpus = JSON.parse(readFileSync(join(ROOT, "data", "sms", "corpus.json"), "utf8")) as { items: SmsRow[] };
  const goldSet = new Set(corpus.items.filter((r) => r.split === "gold").map((r) => r.sn));
  const rows = corpus.items.filter((r) =>
    (splits.includes("dev") && r.split === "dev") ||
    (splits.includes("fixtures") && r.fixture) ||
    (splits.includes("gold") && r.split === "gold"));

  const outPath = join(ROOT, "data", "l1", FILE_OF[model]);
  mkdirSync(join(ROOT, "data", "l1"), { recursive: true });
  const prev: OutFile | null = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : null;
  const byKey = new Map<string, Item>((prev?.items ?? []).map((i) => [i.cache_key, i]));

  const todo = rows.filter((r) => !byKey.has(llmCacheKey(model, r.text, r.sent_at)));
  const failures: { sn: number; error: string }[] = [];
  let calls = 0, done = 0;
  const save = () => {
    const items = [...byKey.values()].sort((a, b) => a.sn - b.sn);
    const out: OutFile = { meta: { source: model as L1Source, model, built_at: nowIso(), n: items.length, failures, calls: (prev?.meta.calls ?? 0) + calls }, items };
    writeFileSync(outPath, JSON.stringify(out, null, 1), "utf8");
  };

  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const row = todo[next++];
      let r = await extractWithLlm(row.text, { model: model!, timeoutMs: TIMEOUT_MS });
      calls++;
      if (!r.ok && r.error !== "no_key") { r = await extractWithLlm(row.text, { model: model!, timeoutMs: TIMEOUT_MS }); calls++; }
      if (r.ok) {
        byKey.set(llmCacheKey(model!, row.text, row.sent_at), {
          sn: row.sn, source: model as L1Source, fields: finalize(r.raw, row), cache_key: llmCacheKey(model!, row.text, row.sent_at),
        });
      } else failures.push({ sn: row.sn, error: r.error });
      done++;
      if (done % 20 === 0) { save(); console.log(`  ${done}/${todo.length}`); }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  save();

  const finalItems = [...byKey.values()];
  const goldInOut = finalItems.filter((i) => goldSet.has(i.sn)).length;
  console.log(`extract-llm ${model}: requested=${rows.length}, cached=${rows.length - todo.length}, called=${todo.length}, ok=${todo.length - failures.length}, failed=${failures.length}, file_n=${finalItems.length}, gold_sn_in_output=${goldInOut}`);
  if (!splits.includes("gold") && goldInOut > 0) {
    console.error("extract-llm: gold sn found in output before review step — check");
    process.exit(5);
  }
}

main();
