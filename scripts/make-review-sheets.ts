// P4·P7 검수 시트(구현명세 §4-4 + 공통 추가지시 §4: 골드 60행·연결 20쌍·사건표는 정확·구간 사건만).
// 앞 열 = 동결 규칙 추출기(r1) 초벌값. 「검수」·「같은사건」·「판정」 칸은 비워 둔다(구현 워커는 채우지 않는다).
// 사용: npm run data:review-sheets -- --stage gold   |   --stage events
// 문안을 화면에 출력하지 않는다(행 수만).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EventsFile, L1ExtractFile, SmsRow } from "../lib/types";
import { linkMessages, linkedPairs, pairKey, type LinkMsg } from "../lib/l1/link";
import { isoToMs, msToIso } from "../lib/l1/dates";
import { writeCsv } from "./_csv";
import { mulberry32 } from "./_rng";

const ROOT = join(__dirname, "..");
const REVIEW = join(ROOT, "data", "review");
const SEED = 20261026;
export const LINK_N = 20;      // 추가지시 §4 (명세 30 → 20)
const show = (iso: string | null) => (iso ? iso.slice(0, 19).replace("T", " ") : "");
const oneLine = (t: string) => t.replace(/\r?\n/g, " ⏎ ");

function load() {
  const corpus = JSON.parse(readFileSync(join(ROOT, "data", "sms", "corpus.json"), "utf8")) as { items: SmsRow[] };
  const split = JSON.parse(readFileSync(join(ROOT, "data", "sms", "split.json"), "utf8")) as { gold_order: { order: number; sn: number }[] };
  const rule = JSON.parse(readFileSync(join(ROOT, "data", "l1", "extract_rule.json"), "utf8")) as L1ExtractFile;
  return { corpus, split, rule };
}

function shuffle<T>(a: T[], rnd: () => number): T[] {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

export const GOLD_HEADER = ["order", "sn", "sent_at", "org", "text", "relevant(Y/N)", "kind", "occurred_clock", "eta_type(absolute/duration/none)", "eta_clock", "eta_minutes", "eta_base(occurrence/sent/unknown)", "restored_clock", "cause6", "areas(쉼표)", "검수(확인/수정)", "메모"];
export const LINK_HEADER = ["pair_id", "sn_a", "sent_a", "text_a", "sn_b", "sent_b", "text_b", "같은사건(예/아니오)", "메모"];
export const EVENTS_HEADER = ["event_id", "org", "outcome(exact/interval/right)", "start_at", "restored_at", "lower_h", "upper_h", "duration_h", "flags", "문자들(sn|발송|문안을 ⏎로 이음)", "판정(맞음/수정/제외)", "수정_발생(YYYY-MM-DD HH:MM)", "수정_복구(YYYY-MM-DD HH:MM)", "수정_유형", "메모"];

function stageGold() {
  const { corpus, split, rule } = load();
  const bySn = new Map(corpus.items.map((r) => [r.sn, r]));
  const ruleBySn = new Map(rule.items.map((i) => [i.sn, i.fields]));

  // 1) 골드 60행 — 규칙 초벌
  const goldRows = split.gold_order.map(({ order, sn }) => {
    const r = bySn.get(sn)!; const f = ruleBySn.get(sn)!;
    const e = f.eta;
    return [order, sn, show(r.sent_at), r.org ?? "", oneLine(r.text), f.relevant ? "Y" : "N", f.kind, f.occurred_clock ?? "",
      e ? e.type : "none", e && e.type === "absolute" ? e.clock : "", e && e.type === "duration" ? e.minutes : "", e && e.type === "duration" ? e.base : "",
      f.restored_clock ?? "", f.cause6, f.areas.join(","), "", ""];
  });
  mkdirSync(REVIEW, { recursive: true });
  writeCsv(join(REVIEW, "gold_review.csv"), GOLD_HEADER, goldRows);

  // 2) 연결 20쌍 — 같은 기관·30시간 안 후보 전체에서 규칙이 연결한 쌍 10 · 연결 안 한 쌍 10
  const msgs: LinkMsg[] = corpus.items.map((r) => ({ sn: r.sn, sent_at: r.sent_at, org: r.org, text: r.text, fields: ruleBySn.get(r.sn)!, source: "rule" }));
  const linked = linkedPairs(linkMessages(msgs));
  const rel = msgs.filter((m) => m.fields.relevant && m.org).sort((a, b) => isoToMs(a.sent_at) - isoToMs(b.sent_at));
  const cands: { a: LinkMsg; b: LinkMsg; linked: boolean }[] = [];
  for (let i = 0; i < rel.length; i++) for (let j = i + 1; j < rel.length; j++) {
    const a = rel[i], b = rel[j];
    if (a.org !== b.org) continue;
    if ((isoToMs(b.sent_at) - isoToMs(a.sent_at)) / 3600000 > 30) continue;
    cands.push({ a, b, linked: linked.has(pairKey(a.sn, b.sn)) });
  }
  const rnd = mulberry32(SEED);
  const yes = shuffle(cands.filter((c) => c.linked), rnd), no = shuffle(cands.filter((c) => !c.linked), rnd);
  const half = LINK_N / 2;
  let pickYes = yes.slice(0, half), pickNo = no.slice(0, half);
  if (pickYes.length < half) pickNo = no.slice(0, LINK_N - pickYes.length);
  if (pickNo.length < half) pickYes = yes.slice(0, LINK_N - pickNo.length);
  const picked = shuffle([...pickYes, ...pickNo], rnd);
  const linkRows = picked.map((c, i) => [`L${String(i + 1).padStart(2, "0")}`, c.a.sn, show(c.a.sent_at), oneLine(c.a.text), c.b.sn, show(c.b.sent_at), oneLine(c.b.text), "", ""]);
  writeCsv(join(REVIEW, "link_review.csv"), LINK_HEADER, linkRows);
  // 규칙이 연결했는지(예측)는 시트에 보이지 않게 따로 둔다 — 검수자가 규칙 판단에 끌리지 않도록
  writeFileSync(join(REVIEW, "_link_candidates_meta.json"), JSON.stringify({
    seed: SEED, n_candidates: cands.length, n_linked_candidates: yes.length, n_unlinked_candidates: no.length,
    pairs: picked.map((c, i) => ({ pair_id: `L${String(i + 1).padStart(2, "0")}`, sn_a: c.a.sn, sn_b: c.b.sn, rule_linked: c.linked })),
  }, null, 1), "utf8");

  writeReadme();
  console.log(`review sheets (gold): gold_review.csv ${goldRows.length} rows, link_review.csv ${linkRows.length} pairs (rule-linked ${pickYes.length} / not ${pickNo.length}, candidates ${cands.length})`);
}

function stageEvents() {
  const { corpus } = load();
  const bySn = new Map(corpus.items.map((r) => [r.sn, r]));
  const ev = JSON.parse(readFileSync(join(ROOT, "data", "events", "events.json"), "utf8")) as EventsFile;
  const target = ev.events.filter((e) => e.outcome === "exact" || e.outcome === "interval");
  const rows = target.map((e) => {
    const restored = e.outcome === "exact" && e.start_at && e.duration_h !== null ? show(msToIso(isoToMs(e.start_at) + Math.round(e.duration_h * 3600000))) : "";
    const smsCell = e.sns.map((sn) => { const r = bySn.get(sn)!; return `${sn}|${show(r.sent_at)}|${oneLine(r.text)}`; }).join(" ⏎ ");
    return [e.event_id, e.org, e.outcome, show(e.start_at), restored, e.lower_h ?? "", e.upper_h ?? "", e.duration_h ?? "", e.flags.join(";"), smsCell, "", "", "", "", ""];
  });
  writeCsv(join(REVIEW, "events_review.csv"), EVENTS_HEADER, rows);
  writeReadme(rows.length);
  console.log(`review sheets (events): events_review.csv ${rows.length} events (exact ${target.filter((e) => e.outcome === "exact").length}, interval ${target.filter((e) => e.outcome === "interval").length})`);
}

function writeReadme(nEvents?: number) {
  const evN = nEvents ?? (existsSync(join(REVIEW, "events_review.csv")) ? countRows(join(REVIEW, "events_review.csv")) : null);
  const evMin = evN === null ? null : Math.max(5, Math.ceil(evN * 0.5));
  const total = 20 + 5 + (evMin ?? 15);
  const md = `# 숨시계 정답 라벨 검수 안내 (박용환 님용)

검수 시트 3개를 엑셀로 열어 **앞 칸의 초벌값(동결한 규칙 추출기 r1이 채운 값)이 문안과 맞는지만** 봐 주세요.
맞으면 「검수」 칸에 **확인**, 틀리면 그 칸 값을 고친 뒤 **수정**이라고 적습니다. AI(LLM) 출력은 초벌에 쓰지 않았습니다.

| 시트 | 행 수 | 할 일 | 예상 소요 |
|---|---|---|---|
| \`gold_review.csv\` | 60행 | 행마다 「검수」 칸에 확인/수정 | 약 20분 |
| \`link_review.csv\` | 20쌍 | 두 문자가 같은 정전인지 「같은사건」 칸에 예/아니오 | 약 5분 |
| \`events_review.csv\` | ${evN === null ? "(다음 단계에 드림)" : `${evN}건`} | 「판정」 칸에 맞음/수정/제외 | ${evMin === null ? "약 15분" : `약 ${evMin}분`} |
| **합계** | | | **약 ${total}분** (40분 이내) |

## gold_review.csv 칸 뜻
- relevant(Y/N): 가구 전력 정전에 관한 문자인가. 신호등·가로등·정수장·가압장·단수만·전차선·열차·절전 권고·훈련은 N
- kind: occurrence(발생) · eta_update(복구 예정·지연 안내) · restoration(복구) · advisory(주의·예고) · other
- occurred_clock / restored_clock / eta_clock: 문안에 적힌 시각을 24시간제 HH:MM으로(예: 18:52). 날짜는 쓰지 않습니다
- eta_type: absolute(「18:00 복구 예정」) · duration(「3시간 소요」) · none
- eta_minutes·eta_base: duration일 때 분과 기준 시각 — occurrence(발생 후) · sent(현재부터) · unknown(기준이 문안에 없음)
- cause6: vehicle(차량·교통사고) · equipment(변압기·선로 등 설비) · fire(화재) · weather(낙뢰·호우 등) · overload(과부하) · work(공사·작업) · unknown
- areas: 동·읍·면·리 이름을 쉼표로

## 판단 기준
- **문안에 없는 값은 비웁니다.** 추측해서 채우지 않습니다.
- 「복구까지 3시간 소요」처럼 기준 시각이 문안에 없으면 eta_base = **unknown**.
- 「현재 … 정전 발생」처럼 발생 시각이 문안에 없으면 occurred_clock을 **비웁니다**.
- 「복구되었음을 알려드립니다」처럼 복구 시각이 없으면 restored_clock을 비웁니다(kind는 restoration).

## events_review.csv (사건표 — 정확·구간 사건만)
- 문자 여러 통을 규칙이 한 사건으로 묶은 결과입니다. 묶음·발생 시각·복구 시각이 맞으면 **맞음**.
- 틀리면 **수정** 후 「수정_발생」「수정_복구」(YYYY-MM-DD HH:MM)·「수정_유형」(exact/interval/right)에 바른 값. 정전 사건이 아니거나 묶음이 잘못됐으면 **제외**.

## 저장 방법
- 엑셀 「다른 이름으로 저장」 → 형식 **CSV UTF-8(쉼표로 분리)** → **같은 이름 그대로** \`data/review/\` 폴더에 덮어씁니다.
- 시각 칸이 엑셀에서 「오후 6:52:00」처럼 바뀌어도 괜찮습니다(읽을 때 바로잡습니다).
- 일부만 하셔도 됩니다: 「검수」 칸이 채워진 행만 검수 건수에 들어갑니다(시트 순서가 층을 번갈아 섞어 둔 순서라 앞에서부터 하시면 됩니다).
- 저장 뒤 담당자가 \`npm run data:ingest-review\` → \`npm run rebuild:data\`를 돌리면 화면·보고서 문구가 「응모자 검수 g건」으로 바뀝니다. 검수 전에는 「정답 라벨 검수 전 — 규칙 추출기 대비 일치율」로 나옵니다.
`;
  writeFileSync(join(REVIEW, "README_검수안내.md"), md, "utf8");
}

function countRows(p: string): number {
  const t = readFileSync(p, "utf8");
  return t.split(/\r\n/).filter((l) => l.trim()).length - 1;
}

const stage = (() => { const i = process.argv.indexOf("--stage"); return i >= 0 ? process.argv[i + 1] : "gold"; })();
if (stage === "gold") stageGold();
else if (stage === "events") stageEvents();
else { console.error("usage: make-review-sheets --stage gold|events"); process.exit(2); }
