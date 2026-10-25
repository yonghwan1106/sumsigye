// P6 사건표(구현명세 §4-6): relevant 문자 → 사건 연결 → 지속시간(정확·구간·오른쪽·제외) → data/events/events.json
// 필드 출처 우선순위: 골드(응모자 검수본) > claude-sonnet-5 > 규칙 r1. 사건 검수(events_review_applied.json)가 있으면 반영.
// LLM을 부르지 않는다(rebuild:data에서 돈다).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EventsFile, L1ExtractFile, L1Gold, L1Resolved, L1Source, OutageEvent, SmsRow } from "../lib/types";
import { buildEvent, flagSameOrgSameDay, linkMessages, type LinkMsg } from "../lib/l1/link";
import { isoToMs, resolve } from "../lib/l1/dates";

const ROOT = join(__dirname, "..");
const nowIso = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(" ", "T") + "+09:00";
const readJson = <T>(p: string): T | null => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null);

export interface EventsReviewApplied {
  meta: { reviewed_n: number; total_n: number; ingested_at: string; csv_sha256: string };
  items: { event_id: string; verdict: "ok" | "fixed" | "excluded" | null; fix_start: string | null; fix_restored: string | null; fix_type: "exact" | "interval" | "right" | null; memo: string }[];
}

function main() {
  const corpus = readJson<{ items: SmsRow[] }>(join(ROOT, "data", "sms", "corpus.json"))!;
  const rule = readJson<L1ExtractFile>(join(ROOT, "data", "l1", "extract_rule.json"))!;
  const sonnet = readJson<L1ExtractFile>(join(ROOT, "data", "l1", "extract_sonnet.json"));
  const gold = readJson<L1Gold>(join(ROOT, "data", "eval", "l1_gold.json"));
  const review = readJson<EventsReviewApplied>(join(ROOT, "data", "events", "events_review_applied.json"));

  const ruleBy = new Map(rule.items.map((i) => [i.sn, i.fields]));
  const sonBy = new Map((sonnet?.items ?? []).map((i) => [i.sn, i.fields]));
  const goldBy = new Map((gold?.items ?? []).filter((i) => i.reviewed).map((i) => [i.sn, i.fields]));
  const sources: Record<L1Source, number> = { rule: 0, "claude-haiku-5-5": 0, "claude-sonnet-5": 0, gold: 0, merged: 0 };

  const msgs: LinkMsg[] = corpus.items.map((r) => {
    let fields: L1Resolved; let source: L1Source;
    const g = goldBy.get(r.sn);
    if (g) { fields = resolve({ ...g, evidence: g.evidence ?? {} }, r.sent_at); source = "gold"; }
    else if (sonBy.has(r.sn)) { fields = sonBy.get(r.sn)!; source = "claude-sonnet-5"; }
    else { fields = ruleBy.get(r.sn)!; source = "rule"; }
    sources[source]++;
    return { sn: r.sn, sent_at: r.sent_at, org: r.org, text: r.text, fields, source };
  });

  const groups = linkMessages(msgs);
  const events: OutageEvent[] = groups.map(buildEvent);
  flagSameOrgSameDay(events);
  const countable = (es: OutageEvent[]) => es.filter((e) => e.outcome === "exact" || e.outcome === "interval").length;
  const n_before = countable(events);

  // 사건 검수 반영
  let reviewed = false;
  if (review && review.meta.reviewed_n > 0) {
    reviewed = true;
    const byId = new Map(review.items.map((i) => [i.event_id, i]));
    for (const e of events) {
      const v = byId.get(e.event_id);
      if (!v || !v.verdict) continue;
      if (v.verdict === "ok") { e.review = { status: "ok", note: v.memo || undefined }; continue; }
      if (v.verdict === "excluded") {
        e.outcome = "excluded"; e.exclude_reason = "reviewer"; e.review = { status: "excluded", note: v.memo || undefined };
        continue;
      }
      // fixed
      const oldStart = e.start_at ? isoToMs(e.start_at) : null;
      if (v.fix_start) e.start_at = v.fix_start;
      const st = e.start_at ? isoToMs(e.start_at) : null;
      if (st !== null) {
        const shift = oldStart !== null ? (oldStart - st) / 3600000 : 0;
        const r3 = (x: number) => Math.round(x * 1000) / 1000;
        if (v.fix_restored) {
          e.outcome = "exact"; e.duration_h = r3((isoToMs(v.fix_restored) - st) / 3600000); e.lower_h = null; e.upper_h = null;
        } else {
          if (e.duration_h !== null) e.duration_h = r3(e.duration_h + shift);
          if (e.lower_h !== null) e.lower_h = r3(e.lower_h + shift);
          if (e.upper_h !== null) e.upper_h = r3(e.upper_h + shift);
        }
        if (v.fix_type && v.fix_type !== e.outcome && !v.fix_restored) {
          if (v.fix_type === "right") { e.upper_h = null; e.duration_h = null; }
          e.outcome = v.fix_type;
        }
        const bad = (e.outcome === "exact" && !(e.duration_h! > 0)) || (e.outcome === "interval" && !(e.upper_h! > 0 && e.upper_h! >= (e.lower_h ?? 0))) || (e.outcome === "right" && !(e.lower_h! > 0));
        if (bad) { e.outcome = "excluded"; e.exclude_reason = "invalid"; }
        if (e.start_at) { const h = Number(e.start_at.slice(11, 13)); e.night = h >= 22 || h < 6; }
      }
      e.review = { status: "fixed", note: v.memo || undefined };
    }
  }
  const n_after = countable(events);
  const n_by_outcome = { exact: 0, interval: 0, right: 0, excluded: 0 };
  for (const e of events) n_by_outcome[e.outcome]++;

  const out: EventsFile = {
    meta: { built_at: nowIso(), n_by_outcome, reviewed, n_before_review: n_before, n_after_review: reviewed ? n_after : null, sources },
    events,
  };
  mkdirSync(join(ROOT, "data", "events"), { recursive: true });
  writeFileSync(join(ROOT, "data", "events", "events.json"), JSON.stringify(out, null, 1), "utf8");
  const flagged = events.filter((e) => e.flags.length).length;
  console.log(`events: n=${events.length} ${JSON.stringify(n_by_outcome)} flagged=${flagged} reviewed=${reviewed} n_before=${n_before} n_after=${reviewed ? n_after : "-"} sources=${JSON.stringify(sources)}`);
}

main();
