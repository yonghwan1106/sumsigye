// P3 규칙 추출기(동결 r1) 전량 실행 → data/l1/extract_rule.json (구현명세 §4-3).
// 골드 행도 처리하지만 문안·결과를 화면에 출력하지 않는다(건수만).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { L1ExtractFile, L1Result, SmsRow } from "../lib/types";
import { RULE_VERSION, ruleExtract } from "../lib/l1/ruleExtract";
import { finalize } from "../lib/l1/validate";

const ROOT = join(__dirname, "..");
const nowIso = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(" ", "T") + "+09:00";

function main() {
  const corpus = JSON.parse(readFileSync(join(ROOT, "data", "sms", "corpus.json"), "utf8")) as { items: SmsRow[] };
  const items: L1Result[] = corpus.items.map((row) => ({
    sn: row.sn, source: "rule", rule_version: RULE_VERSION, fields: finalize(ruleExtract(row), row),
  }));
  const out: L1ExtractFile = { meta: { source: "rule", rule_version: RULE_VERSION, built_at: nowIso(), n: items.length }, items };
  mkdirSync(join(ROOT, "data", "l1"), { recursive: true });
  writeFileSync(join(ROOT, "data", "l1", "extract_rule.json"), JSON.stringify(out, null, 1), "utf8");
  const rel = items.filter((i) => i.fields.relevant).length;
  const byKind: Record<string, number> = {};
  for (const i of items) byKind[i.fields.kind] = (byKind[i.fields.kind] ?? 0) + 1;
  const warn = items.filter((i) => i.fields.warnings.length).length;
  console.log(`extract_rule ${RULE_VERSION}: n=${items.length}, relevant=${rel}, kinds=${JSON.stringify(byKind)}, rows_with_warnings=${warn}`);
}

main();
