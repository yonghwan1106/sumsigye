// P8 검수 반영(구현명세 §4 P8): 박용환이 고친 CSV 3개 → data/eval/l1_gold.json · link_gold.json · data/events/events_review_applied.json
// 「검수」(골드)·「같은사건」(연결)·「판정」(사건) 칸이 채워진 행만 검수 건수에 든다. 구현 워커는 CSV를 고치지 않는다.
// 검수 전(CSV가 초벌 그대로)이면 reviewed_n = 0 으로 만든다(폴백).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Cause6, EtaRaw, L1Gold, L1Raw, LinkGold, SmsKind } from "../lib/types";
import { normClock, normDateTime, readCsv } from "./_csv";
import { GOLD_HEADER, LINK_HEADER, EVENTS_HEADER } from "./_review_headers";

const ROOT = join(__dirname, "..");
const REVIEW = join(ROOT, "data", "review");
const nowIso = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(" ", "T") + "+09:00";
const KINDS: SmsKind[] = ["occurrence", "eta_update", "restoration", "advisory", "other"];
const CAUSES: Cause6[] = ["vehicle", "equipment", "fire", "weather", "overload", "work", "unknown"];
const problems: string[] = [];

/** 머리 이름이 조금 달라도(괄호 설명 없이) 찾는다 */
function col(row: Record<string, string>, name: string): string {
  if (name in row) return row[name];
  const base = name.replace(/\(.*\)$/, "");
  const k = Object.keys(row).find((h) => h.replace(/\(.*\)$/, "").trim() === base);
  return k ? row[k] : "";
}

function goldRow(r: Record<string, string>, line: number): { raw: L1Raw; ok: boolean } {
  const rel = col(r, GOLD_HEADER[5]).toUpperCase();
  const kind = col(r, "kind").trim() as SmsKind;
  const cause = col(r, "cause6").trim() as Cause6;
  const clock = (field: string) => {
    const v = normClock(col(r, field));
    if (v === undefined) { problems.push(`gold line ${line}: ${field} 형식`); return null; }
    return v;
  };
  const etaType = col(r, GOLD_HEADER[8]).trim().toLowerCase();
  let eta: EtaRaw = null;
  if (etaType === "absolute") {
    const c = clock("eta_clock");
    eta = c ? { type: "absolute", clock: c } : null;
  } else if (etaType === "duration") {
    const m = Number(col(r, "eta_minutes"));
    const base = col(r, GOLD_HEADER[11]).trim().toLowerCase();
    if (Number.isFinite(m) && m > 0 && ["occurrence", "sent", "unknown"].includes(base)) eta = { type: "duration", minutes: Math.round(m), base: base as "occurrence" | "sent" | "unknown" };
    else problems.push(`gold line ${line}: eta duration 값`);
  }
  const raw: L1Raw = {
    relevant: rel === "Y" || rel === "예",
    kind: KINDS.includes(kind) ? kind : "other",
    place_text: null,
    areas: col(r, GOLD_HEADER[14]).split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    occurred_clock: clock("occurred_clock"),
    eta,
    restored_clock: clock("restored_clock"),
    cause6: CAUSES.includes(cause) ? cause : "unknown",
    scale_hint: null,
    evidence: {},
  };
  if (!KINDS.includes(kind)) problems.push(`gold line ${line}: kind 값`);
  if (!CAUSES.includes(cause)) problems.push(`gold line ${line}: cause6 값`);
  return { raw, ok: true };
}

function main() {
  mkdirSync(join(ROOT, "data", "eval"), { recursive: true });
  mkdirSync(join(ROOT, "data", "events"), { recursive: true });
  const at = nowIso();

  // 1) 골드
  const gp = join(REVIEW, "gold_review.csv");
  if (!existsSync(gp)) throw new Error("gold_review.csv 없음 — 먼저 data:review-sheets -- --stage gold");
  const g = readCsv(gp);
  const items: L1Gold["items"] = [];
  g.rows.forEach((r, i) => {
    const sn = Number(col(r, "sn")); const order = Number(col(r, "order"));
    if (!Number.isFinite(sn)) return;
    const mark = col(r, GOLD_HEADER[15]).trim();
    const reviewed = mark.length > 0;
    const { raw } = goldRow(r, i + 2);
    items.push({ sn, order, reviewed, changed: mark.includes("수정"), fields: raw });
  });
  const reviewed_n = items.filter((i) => i.reviewed).length;
  const gold: L1Gold = {
    meta: { labeler: reviewed_n > 0 ? "applicant" : "none", method: reviewed_n > 0 ? "rule_draft_then_full_review" : "none",
      draft_source: "rule:r1", reviewed_n, total_n: items.length, ingested_at: at, csv_sha256: g.sha256 },
    items,
  };
  writeFileSync(join(ROOT, "data", "eval", "l1_gold.json"), JSON.stringify(gold, null, 1), "utf8");

  // 2) 연결
  const lp = join(REVIEW, "link_review.csv");
  const pairs: LinkGold["pairs"] = [];
  if (existsSync(lp)) {
    for (const r of readCsv(lp).rows) {
      const v = col(r, LINK_HEADER[7]).trim();
      const same = /^(예|y|yes|o|같음)$/i.test(v) ? true : /^(아니오|아니요|n|no|x|다름)$/i.test(v) ? false : null;
      pairs.push({ pair_id: col(r, "pair_id"), sn_a: Number(col(r, "sn_a")), sn_b: Number(col(r, "sn_b")), same_event: same });
    }
  }
  const link: LinkGold = { meta: { reviewed_n: pairs.filter((p) => p.same_event !== null).length, ingested_at: at }, pairs };
  writeFileSync(join(ROOT, "data", "eval", "link_gold.json"), JSON.stringify(link, null, 1), "utf8");

  // 3) 사건
  const ep = join(REVIEW, "events_review.csv");
  const evItems: { event_id: string; verdict: "ok" | "fixed" | "excluded" | null; fix_start: string | null; fix_restored: string | null; fix_type: "exact" | "interval" | "right" | null; memo: string }[] = [];
  let evSha = "";
  if (existsSync(ep)) {
    const e = readCsv(ep); evSha = e.sha256;
    e.rows.forEach((r, i) => {
      const v = col(r, EVENTS_HEADER[10]).trim();
      const verdict = v === "맞음" ? "ok" : v === "수정" ? "fixed" : v === "제외" ? "excluded" : null;
      if (v && !verdict) problems.push(`events line ${i + 2}: 판정 값`);
      const fs = normDateTime(col(r, EVENTS_HEADER[11])); const fr = normDateTime(col(r, EVENTS_HEADER[12]));
      if (fs === undefined) problems.push(`events line ${i + 2}: 수정_발생 형식`);
      if (fr === undefined) problems.push(`events line ${i + 2}: 수정_복구 형식`);
      const ft = col(r, "수정_유형").trim().toLowerCase();
      evItems.push({ event_id: col(r, "event_id"), verdict, fix_start: fs ?? null, fix_restored: fr ?? null,
        fix_type: ft === "exact" || ft === "interval" || ft === "right" ? ft : null, memo: col(r, "메모") });
    });
  }
  const applied = { meta: { reviewed_n: evItems.filter((x) => x.verdict).length, total_n: evItems.length, ingested_at: at, csv_sha256: evSha }, items: evItems };
  writeFileSync(join(ROOT, "data", "events", "events_review_applied.json"), JSON.stringify(applied, null, 1), "utf8");

  console.log(`ingest-review: gold reviewed ${reviewed_n}/${items.length} (changed ${items.filter((i) => i.changed).length}), link reviewed ${link.meta.reviewed_n}/${pairs.length}, events reviewed ${applied.meta.reviewed_n}/${evItems.length}${problems.length ? `, problems ${problems.length}: ${problems.slice(0, 8).join("; ")}` : ""}`);
}

main();
