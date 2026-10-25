// L1 평가(구현명세 §5-1) → data/eval/l1_results.json. LLM을 부르지 않는다(rebuild:data에서 돈다).
// 정답 = 응모자가 검수한 골드 g건(l1_gold.json reviewed=true). g < 40이면 정확도 칸은 null(폴백)이고,
// 그 대신 「정답 라벨 검수 전 — 규칙 추출기 대비 일치율」(vs_rule)을 개발용 문자에서 계산해 따로 싣는다(공통 추가지시 §4).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { L1ExtractFile, L1Gold, L1Raw, L1Resolved, L1Results, LinkGold, SmsRow } from "../lib/types";
import { GROUP_OF } from "../lib/types";
import { parseClock } from "../lib/l1/dates";
import { linkMessages, linkedPairs, pairKey, type LinkMsg } from "../lib/l1/link";

const ROOT = join(__dirname, "..");
const readJson = <T>(p: string): T | null => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null);
const nowIso = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(" ", "T") + "+09:00";
export const MIN_REVIEWED = 40;
type Sys = "rule" | "claude-haiku-5-5" | "claude-sonnet-5";
const SYSTEMS: Sys[] = ["rule", "claude-haiku-5-5", "claude-sonnet-5"];
const FILE: Record<Sys, string> = { rule: "extract_rule.json", "claude-haiku-5-5": "extract_haiku.json", "claude-sonnet-5": "extract_sonnet.json" };
const r4 = (x: number | null) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);
const rate = (a: number, n: number) => (n > 0 ? r4(a / n) : null);

const mins = (c: string | null) => { const p = parseClock(c); return p ? p.h * 60 + p.m : null; };

/** pred vs ref 칸별 비교 집계 */
function compareSet(pairs: { pred: L1Raw; ref: L1Raw }[]) {
  let tp = 0, fp = 0, fn = 0;
  let kindN = 0, kindOk = 0, timeN = 0, timeOk = 0, nullN = 0, nullOk = 0, baseN = 0, baseOk = 0, c6N = 0, c6Ok = 0, c3Ok = 0;
  for (const { pred, ref } of pairs) {
    if (pred.relevant && ref.relevant) tp++; else if (pred.relevant && !ref.relevant) fp++; else if (!pred.relevant && ref.relevant) fn++;
    if (ref.relevant) {
      kindN++; if (pred.kind === ref.kind) kindOk++;
      c6N++; if (pred.cause6 === ref.cause6) c6Ok++; if (GROUP_OF[pred.cause6] === GROUP_OF[ref.cause6]) c3Ok++;
    }
    for (const f of ["occurred_clock", "restored_clock"] as const) {
      const rv = mins(ref[f]), pv = mins(pred[f]);
      if (rv === null) { nullN++; if (pv === null) nullOk++; }
      else { timeN++; if (pv === rv) timeOk++; }
    }
    const re = ref.eta, pe = pred.eta;
    if (!re) { nullN++; if (!pe) nullOk++; }
    else {
      timeN++;
      if (re.type === "absolute" && pe && pe.type === "absolute" && mins(pe.clock) === mins(re.clock)) timeOk++;
      if (re.type === "duration" && pe && pe.type === "duration" && pe.minutes === re.minutes && pe.base === re.base) timeOk++;
      if (re.type === "duration") { baseN++; if (pe && pe.type === "duration" && pe.base === re.base) baseOk++; }
    }
  }
  const prec = tp + fp > 0 ? tp / (tp + fp) : null, rec = tp + fn > 0 ? tp / (tp + fn) : null;
  const f1 = prec !== null && rec !== null && prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : null;
  return {
    n: pairs.length, relevant_f1: r4(f1), kind_acc: rate(kindOk, kindN),
    time_exact: { rate: rate(timeOk, timeN), n: timeN }, null_correct: { rate: rate(nullOk, nullN), n: nullN },
    eta_base_acc: rate(baseOk, baseN), eta_base_n: baseN, cause6_acc: rate(c6Ok, c6N), cause3_acc: rate(c3Ok, c6N), kind_n: kindN,
  };
}

function autoCheck(file: L1ExtractFile | null) {
  if (!file) return null;
  let ek = 0, ed = 0, tk = 0, td = 0;
  for (const it of file.items) {
    const f = it.fields;
    ek += Object.values(f.evidence ?? {}).filter((v) => typeof v === "string" && v).length;
    ed += f.warnings.filter((w) => w.startsWith("evidence_not_in_text") || w === "place_not_in_text").length;
    tk += [f.occurred_clock, f.restored_clock, f.eta && f.eta.type === "absolute" ? f.eta.clock : null].filter((c) => c !== null).length;
    td += f.warnings.filter((w) => w.startsWith("bad_clock") || w.startsWith("clock_not_in_text")).length;
  }
  return { evidence_in_text: r4(ek + ed > 0 ? ek / (ek + ed) : 1) as number, time_format_ok: r4(tk + td > 0 ? tk / (tk + td) : 1) as number, n: file.items.length, evidence_n: ek + ed, time_n: tk + td };
}

function main() {
  const corpus = readJson<{ items: SmsRow[] }>(join(ROOT, "data", "sms", "corpus.json"))!;
  const bySn = new Map(corpus.items.map((r) => [r.sn, r]));
  const files = Object.fromEntries(SYSTEMS.map((s) => [s, readJson<L1ExtractFile>(join(ROOT, "data", "l1", FILE[s]))])) as Record<Sys, L1ExtractFile | null>;
  const pred = Object.fromEntries(SYSTEMS.map((s) => [s, new Map((files[s]?.items ?? []).map((i) => [i.sn, i.fields]))])) as Record<Sys, Map<number, L1Resolved>>;
  const gold = readJson<L1Gold>(join(ROOT, "data", "eval", "l1_gold.json"));
  const linkGold = readJson<LinkGold>(join(ROOT, "data", "eval", "link_gold.json"));

  const reviewedItems = (gold?.items ?? []).filter((i) => i.reviewed);
  const g = reviewedItems.length;
  const total_n = gold?.meta.total_n ?? 0;
  const goldMode = g >= MIN_REVIEWED;

  // 연결 정밀도·재현율(연결 골드 검수분이 있을 때)
  const linkPairs = (linkGold?.pairs ?? []).filter((p) => p.same_event !== null);
  const linkPR = (s: Sys) => {
    if (!linkPairs.length) return { p: null as number | null, r: null as number | null };
    const msgs: LinkMsg[] = corpus.items.map((row) => ({ sn: row.sn, sent_at: row.sent_at, org: row.org, text: row.text,
      fields: pred[s].get(row.sn) ?? pred.rule.get(row.sn)!, source: s }));
    const linked = linkedPairs(linkMessages(msgs));
    let tp = 0, fp = 0, fn = 0;
    for (const p of linkPairs) {
      const yhat = linked.has(pairKey(p.sn_a, p.sn_b));
      if (yhat && p.same_event) tp++; else if (yhat && !p.same_event) fp++; else if (!yhat && p.same_event) fn++;
    }
    return { p: tp + fp > 0 ? r4(tp / (tp + fp)) : null, r: tp + fn > 0 ? r4(tp / (tp + fn)) : null };
  };

  const rows: L1Results["rows"] = SYSTEMS.map((s) => {
    const lk = linkPR(s);
    if (!goldMode) {
      return { system: s, relevant_f1: null, kind_acc: null, time_exact: { rate: null, n: 0 }, null_correct: { rate: null, n: 0 },
        eta_base_acc: null, cause6_acc: null, cause3_acc: null, link_p: lk.p, link_r: lk.r };
    }
    const pairs = reviewedItems.filter((i) => pred[s].has(i.sn)).map((i) => ({ pred: pred[s].get(i.sn)!, ref: i.fields }));
    if (!pairs.length) {
      return { system: s, relevant_f1: null, kind_acc: null, time_exact: { rate: null, n: 0 }, null_correct: { rate: null, n: 0 },
        eta_base_acc: null, cause6_acc: null, cause3_acc: null, link_p: lk.p, link_r: lk.r };
    }
    const c = compareSet(pairs);
    return { system: s, relevant_f1: c.relevant_f1, kind_acc: c.kind_acc, time_exact: c.time_exact, null_correct: c.null_correct,
      eta_base_acc: c.eta_base_acc, cause6_acc: c.cause6_acc, cause3_acc: c.cause3_acc, link_p: lk.p, link_r: lk.r, n_items: c.n } as L1Results["rows"][number];
  });

  // 실시간 모드: haiku-5-5 시각 정확일치 < rule 이면 필드 병합(§5-1). 정답 검수 전에는 판단하지 않고 기본 llm.
  let realtime_mode: "llm" | "merged" = "llm";
  if (goldMode) {
    const hr = rows.find((r) => r.system === "claude-haiku-5-5")!.time_exact.rate;
    const rr = rows.find((r) => r.system === "rule")!.time_exact.rate;
    if (hr !== null && rr !== null && hr < rr) realtime_mode = "merged";
  }

  // 검수 전 폴백 지표: 규칙 추출기 대비 일치율(개발용 문자 — 골드 행 제외)
  const vsRule = (["claude-sonnet-5", "claude-haiku-5-5"] as Sys[]).map((s) => {
    const pairs = [...pred[s].entries()].filter(([sn]) => bySn.get(sn)?.split === "dev" && pred.rule.has(sn)).map(([sn, f]) => ({ pred: f, ref: pred.rule.get(sn)! }));
    const c = compareSet(pairs);
    return { system: s, n: c.n, relevant_agree_f1: c.relevant_f1, kind_agree: c.kind_acc, time_agree: c.time_exact, null_agree: c.null_correct,
      eta_base_agree: c.eta_base_acc, cause6_agree: c.cause6_acc, cause3_agree: c.cause3_acc };
  });

  const auto_checks = SYSTEMS.map((s) => { const a = autoCheck(files[s]); return a ? { system: s, ...a } : null; }).filter(Boolean) as L1Results["auto_checks"];

  const label_line = g === 0 ? "정답 라벨 검수 전 — 규칙 추출기 대비 일치율"
    : !goldMode ? `응모자 검수 ${g}건(${MIN_REVIEWED}건 미만) — 정확도는 싣지 않고 규칙 추출기 대비 일치율만`
      : `정답 라벨: 규칙 초벌 후 응모자 전수 검수 ${g}건`;

  const out = {
    status: "final" as const,
    meta: {
      reviewed_n: g, total_n, labeler: g > 0 ? "applicant" as const : "none" as const,
      method: g > 0 ? "rule_draft_then_full_review" : "none", realtime_mode,
      reference: goldMode ? "gold" : "none", min_reviewed: MIN_REVIEWED, label_line,
      link_reviewed_n: linkPairs.length, gold_csv_sha256: gold?.meta.csv_sha256 ?? null, built_at: nowIso(),
    },
    rows, auto_checks,
    vs_rule: { label: "정답 라벨 검수 전 — 규칙 추출기 대비 일치율", set: "dev(골드 행 제외)", reference: "rule:r1", rows: vsRule },
  };
  writeFileSync(join(ROOT, "data", "eval", "l1_results.json"), JSON.stringify(out, null, 1), "utf8");
  const fmt = (x: number | null) => (x === null ? "null" : x.toFixed(3));
  console.log(`eval-l1: reviewed_n=${g}/${total_n} mode=${goldMode ? "gold" : "fallback"} realtime_mode=${realtime_mode} link_reviewed=${linkPairs.length}`);
  for (const r of rows) console.log(`  ${r.system}: time_exact=${fmt(r.time_exact.rate)}(n=${r.time_exact.n}) null_correct=${fmt(r.null_correct.rate)} f1=${fmt(r.relevant_f1)} link_p=${fmt(r.link_p)}`);
  for (const v of vsRule) console.log(`  vs_rule ${v.system}: n=${v.n} time_agree=${fmt(v.time_agree.rate)}(n=${v.time_agree.n}) null_agree=${fmt(v.null_agree.rate)} kind_agree=${fmt(v.kind_agree)} rel_f1=${fmt(v.relevant_agree_f1)} cause6=${fmt(v.cause6_agree)}`);
  for (const a of auto_checks) console.log(`  auto ${a.system}: evidence_in_text=${a.evidence_in_text} time_format_ok=${a.time_format_ok}`);
}

main();
