// L1 규칙 추출기 r1 (구현명세 §4-3). 개발용(dev) 행과 고정 문자만 보고 만들었다 — 골드 행 문안은 보지 않았다.
// 입력 SmsRow(문안·발송 시각) → 출력 L1Raw. 날짜 보정은 dates.ts, 검증은 validate.ts가 한다.
// LLM이 실패하면 /api/extract가 이 추출기로 폴백한다(C2b).
import type { Cause6, EtaRaw, L1Raw, SmsKind } from "../types";

export const RULE_VERSION = "r1";

// ───────────── 시각 토큰 ─────────────
export interface ClockToken {
  start: number; end: number; raw: string;   // raw = 원문 부분 문자열
  h: number; m: number;                       // 24시간제(오후 표기 반영, 24시 → 0)
  ampm: "am" | "pm" | null;                   // 오전/오후 표기
  range: boolean;                             // 「09~10시」「22시~06시」 같은 범위의 한쪽
}

const RE_HHMM = /(?<![\d.:])(\d{1,2}):(\d{2})(?:\s*시)?(?:\s*(?:분경|분|경|부로|부터|까지))?/g;
const RE_HSI = /(?<![\d.:~\-])(\d{1,2})\s*시(?!간|청|민|내|장)(?:\s*(\d{1,2})\s*(?:분|(?=경)))?(?:\s*(?:경|부로|부터|까지))?/g;

/** 원문에서 시각 표현을 모두 찾는다(검증기도 같은 함수를 써서 시각 문자열이 원문에 있는지 본다). */
export function findClocks(text: string): ClockToken[] {
  const out: ClockToken[] = [];
  const taken: [number, number][] = [];
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);
  for (const m of text.matchAll(RE_HHMM)) {
    const s = m.index!, e = s + m[0].length;
    const h = Number(m[1]), mi = Number(m[2]);
    if (h > 24 || mi > 59) continue;
    taken.push([s, e]);
    out.push(mk(text, s, e, h, mi));
  }
  for (const m of text.matchAll(RE_HSI)) {
    const s = m.index!, e = s + m[0].length;
    if (overlaps(s, e)) continue;
    const h = Number(m[1]), mi = m[2] ? Number(m[2]) : 0;
    if (h > 24 || mi > 59) continue;
    taken.push([s, e]);
    out.push(mk(text, s, e, h, mi));
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

function mk(text: string, s: number, e: number, h: number, mi: number): ClockToken {
  const before = text.slice(Math.max(0, s - 5), s);
  const ampm: "am" | "pm" | null = /오후\s*$/.test(before) ? "pm" : /오전\s*$/.test(before) ? "am" : null;
  let hh = h;
  if (ampm === "pm" && hh < 12) hh += 12;
  if (hh === 24) hh = 0;
  const near = text.slice(Math.max(0, s - 2), Math.min(text.length, e + 2));
  const range = /~\s*$/.test(text.slice(Math.max(0, s - 2), s)) || /^\s*~\s*\d/.test(text.slice(e, e + 4)) || /\d\s*~\s*$/.test(text.slice(Math.max(0, s - 4), s));
  void near;
  return { start: s, end: e, raw: text.slice(s, e).trim(), h: hh, m: mi, ampm, range };
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const clockStr = (t: { h: number; m: number }) => `${pad2(t.h)}:${pad2(t.m)}`;

// ───────────── 낱말 사전(개발용 행에서 만든 것) ─────────────
// 복구 낱말. 뒤에 「예정·예상·까지·될 것」이 붙으면 복구가 아니라 예고다.
const RE_RESTORE = /복구\s*가?\s*(?:모두\s*)?완료|복구완료|복전\s*완료|복전완료|복전|복구\s*되었|복구되었|복구됐|복구\s*되어|복구되어|정상화/g;
const RE_RESTORE_NEG = /^[^.。\n]{0,6}?(?:예정|예상|시까지|까지|될\s*것|할\s*것)/;
// 무관(가구 전력 정전이 아님): 신호등·가로등·정수장·가압장·전차선·상수도·절전 권고·훈련 등
const RE_IRRELEVANT = /정수장|가압장|전차선|가로등|신호등이?\s*정전|이토작업|상수도|수돗물|탁수|적정\s*온도|전기\s*사용\s*집중|무더위\s*(?:대비|지속)|훈련|열차|지하철/;
const RE_OUTAGE = /정전|복전|단전/;
// 발생(진행 중) 표지
const RE_OCC = /발생|정전\s*되|정전으로|정전\s*중|정전사고|정전입니다|정전\s*상황|정전사태|정전\(단전\)\s*되|정전\s*알림|정전\s*\.|정전\s*,|일대\s*정전|지역\s*정전/;
// 예고·가능성 표지(아직 일어나지 않은 정전)
const RE_PLANNED = /정전\s*(?:\(단전\)\s*)?(?:이\s*)?(?:예정|예상|될\s*수|될\s*예정|우려)|정전될|정전이\s*될|단전\)?\s*(?:이\s*)?되오니|\(정전\)\s*이?\s*되오니|불시\s*정전|정전에\s*대비|정전\s*대비/;
const RE_DELAY = /지연/;

// 원인 사전 cause6 (명세 §4-3 + 개발용 행에서 본 낱말). 앞 원인이 우선.
const CAUSE_RULES: [Cause6, RegExp][] = [
  ["vehicle", /차량|추돌|교통사고|전신주\s*파손|전신주파손|전주\s*파손|충돌|전복사고|사다리차/],
  ["fire", /화재|산불|불꽃|완진/],
  ["weather", /낙뢰|돌풍|강풍|폭설|대설|태풍|호우|침수|폭우|우박/],
  ["work", /(?<!전력)공사|굴착|(?<!복구\s?)작업\s*중|작업을\s*위해|작업으로|설치\s*작업|설비\s*교체|설비교체|전력설비\s*교체/],
  ["overload", /과부하|전기\s*사용\s*집중|사용량\s*증가|과열|전력사용\s*급증/],
  ["equipment", /변압기|전압기|개폐기|고압선|고압전선|단선|단락|설비|선로|애자|케이블|전선|전깃줄|전도|노후|누수/],
];

// 지역(동·읍·면·리) — 「고삼,대덕,양성면」처럼 쉼표로 이은 목록은 앞 낱말도 함께 넣는다.
const RE_AREA_LIST = /((?:[가-힣0-9][가-힣0-9.]{0,7}\s*[,·]\s*)*[가-힣0-9][가-힣0-9.]{0,7}(?:동|읍|면|리))(?=$|[^가-힣]|일대|일원|일부|지역|인근|부근|주변|전체|에서|에\s|은\s|이\s|과\s)/g;
const AREA_STOP = /^(?:\d+\s*개?동|이동|작동|미작동|활동|야외활동|자동|가동|재가동|행동|출동|운동|공동|관리|안전관리|.*거리|정리|수리|처리|도로변|전면|측면|이면|화면|방면|당면|우리|주변|일부|발생|현재|종다리)$/;
// 목록 앞쪽 낱말(접미사 없이 쓴 지명 「고삼」)이 동사·조사로 끝나면 지명이 아니다
const AREA_PREFIX_BAD = /(?:니|고|며|서|데|요|다|만|도|은|는|가|을|를|에|의|로|중)$/;

const RE_SCALE = /\d+\s*여?\s*(?:세대|가구)|대규모|곳곳|전역|전체|일대|일원|일부\s*지역|일부/;

// 예고 시간(duration). 「복구까지 3시간 소요예상」「약 2~3시간 이상 소요」「30분 이내 완료 예정」「2-3일 소요」
const RE_DURATION = /(\d+)(?:\s*[~\-]\s*(\d+))?\s*(시간|분|일)(?:\s*(\d+)\s*분)?(?:\s*(?:이상|정도|가량|내외))?\s*\)?\s*(?:이|가)?\s*(?:소요|예상|예정|이내|내\s*복구|내\s*완료)/;

function areasOf(text: string): { areas: string[]; place: string | null } {
  const areas: string[] = [];
  let first = -1, last = -1;
  for (const m of text.matchAll(RE_AREA_LIST)) {
    const parts = m[1].split(/[,·]/).map((p) => p.trim()).filter(Boolean);
    let used = false;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (AREA_STOP.test(p) || /^[\d.]+$/.test(p)) continue;
      if (i < parts.length - 1 && !/(?:동|읍|면|리)$/.test(p) && AREA_PREFIX_BAD.test(p)) continue;
      if (!areas.includes(p)) areas.push(p);
      used = true;
    }
    if (used) {
      if (first < 0) first = m.index!;
      last = m.index! + m[0].length;
    }
  }
  let place: string | null = null;
  if (first >= 0) {
    // 지역 낱말 뒤 번지(「325-25」「1420-17번지」)까지 포함
    const tail = text.slice(last).match(/^\s*(?:산\s*)?\d+(?:-\d+)?(?:번지)?/);
    place = text.slice(first, last + (tail ? tail[0].length : 0)).trim();
  }
  return { areas, place };
}

type ClockRole = "restored" | "eta" | "plain" | "planned";

function classify(text: string, c: ClockToken): ClockRole {
  if (c.range) return "planned";
  const before = text.slice(Math.max(0, c.start - 16), c.start);
  const after = text.slice(c.end, c.end + 16);
  if (/내일\s*(?:오전|오후)?\s*$/.test(before)) return "planned";
  // 복구 시각: 「22:40경 복구완료」「15:39부로 복전」「17시 복구 완료」, 「복구 완료(20:37)」
  const rAfter = after.match(/^\s*(?:경|부로)?\s*(?:정전\s*)?(복구\s*가?\s*(?:모두\s*)?완료|복구완료|복전|복구\s*되|복구되)/);
  if (rAfter) {
    const rest = text.slice(c.end + rAfter[0].length);
    if (!RE_RESTORE_NEG.test(rest)) return "restored";
    return "eta";
  }
  if (/(?:복구\s*완료|복구완료|복전\s*완료)\s*\(\s*$/.test(before)) return "restored";
  // 예고 시각
  if (/^\s*(?:경\s*)?까지/.test(after) || /까지\s*$/.test(c.raw)) return "eta";
  if (/^\s*(?:경\s*)?(?:정전\s*)?(?:복구\s*)?(?:완료\s*)?(?:가\s*|이\s*)?(?:예정|예상)/.test(after)) return "eta";
  if (/(?:예정|예상)[^.。\n]{0,6}(?:시각|시간)\s*[:：]?\s*(?:\d{1,2}\.\s*\d{1,2}\.\s*)?$/.test(before)) return "eta";
  if (/(?:예정|예상)\s*\(\s*$/.test(before)) return "eta";
  return "plain";
}

function etaFromDuration(text: string): { eta: EtaRaw; ev: string } | null {
  const m = text.match(RE_DURATION);
  if (!m) return null;
  const a = Number(m[1]), b = m[2] ? Number(m[2]) : null, unit = m[3], extra = m[4] ? Number(m[4]) : 0;
  const n = b ?? a;   // 범위면 위끝(보수)
  const minutes = unit === "시간" ? n * 60 + extra : unit === "일" ? n * 1440 : n;
  if (!(minutes > 0)) return null;
  const ctx = text.slice(Math.max(0, m.index! - 14), m.index!);
  const base: "occurrence" | "sent" | "unknown" = /발생\s*(?:후|으로부터|로부터)/.test(ctx) ? "occurrence" : /(?:현재|지금)\s*부터/.test(ctx) ? "sent" : "unknown";
  return { eta: { type: "duration", minutes, base }, ev: m[0] };
}

/** 문안 한 통 → L1Raw (규칙 r1). */
export function ruleExtract(row: { text: string; sent_at?: string; org?: string | null }): L1Raw {
  const text = row.text;
  const evidence: L1Raw["evidence"] = {};
  const hasOutage = RE_OUTAGE.test(text);
  const irr = RE_IRRELEVANT.exec(text);
  const relevant = hasOutage && !irr;

  // 복구 낱말(예고형 제외)
  let restorePhrase: { idx: number; s: string } | null = null;
  for (const m of text.matchAll(RE_RESTORE)) {
    const rest = text.slice(m.index! + m[0].length);
    if (RE_RESTORE_NEG.test(rest)) continue;
    restorePhrase = { idx: m.index!, s: m[0] };
    break;
  }

  const clocks = findClocks(text).map((c) => ({ c, role: classify(text, c) }));
  let occurred: ClockToken | null = null;
  let restored: ClockToken | null = null;
  let etaClock: ClockToken | null = null;
  for (const { c, role } of clocks) {
    if (role === "restored" && !restored) restored = c;
    else if (role === "eta" && !etaClock) etaClock = c;
  }
  const plains = clocks.filter((x) => x.role === "plain").map((x) => x.c);
  if (restorePhrase) {
    // 복구 문자: 시각 뒤, 복구 낱말 앞에 「발생」이 있으면 발생 시각, 없으면 복구 시각
    for (const c of plains) {
      const between = c.start < restorePhrase.idx ? text.slice(c.end, restorePhrase.idx) : text.slice(c.end, c.end + 30);
      if (/발생/.test(between)) { if (!occurred) occurred = c; }
      else if (!restored && c.start < restorePhrase.idx) restored = c;
      else if (!occurred && c.start < restorePhrase.idx) occurred = c;
    }
  } else if (plains.length) {
    occurred = plains[0];
  }

  let eta: EtaRaw = null;
  if (etaClock) {
    eta = { type: "absolute", clock: clockStr(etaClock) };
    evidence.eta = etaClock.raw;
  } else {
    const d = etaFromDuration(text);
    if (d) { eta = d.eta; evidence.eta = d.ev; }
  }
  if (occurred) evidence.occurred = occurred.raw;
  if (restored) evidence.restored = restored.raw;

  // 종류
  let kind: SmsKind;
  const occM = RE_OCC.exec(text);
  const planM = RE_PLANNED.exec(text);
  if (!hasOutage) { kind = "other"; }
  else if (!relevant) { kind = /대비|유지|자제|유의/.test(text) && !occurred ? "advisory" : "other"; if (irr) evidence.kind = irr[0]; }
  else if (restorePhrase) { kind = "restoration"; evidence.kind = restorePhrase.s; }
  else if (planM && !occM) {
    kind = "advisory"; evidence.kind = planM[0];
    if (occurred) { occurred = null; delete evidence.occurred; }   // 예고된 정전의 시각은 발생 시각이 아니다
  }
  else if (eta && (RE_DELAY.test(text) || (!occurred && !/발생/.test(text)))) {
    kind = "eta_update";
    const dm = RE_DELAY.exec(text);
    evidence.kind = dm ? dm[0] : (evidence.eta as string);
  }
  else if (occM || occurred) { kind = "occurrence"; evidence.kind = occM ? occM[0] : (occurred as ClockToken).raw; }
  else { kind = "advisory"; }

  // 원인
  let cause6: Cause6 = "unknown";
  for (const [c, re] of CAUSE_RULES) {
    const m = re.exec(text);
    if (m) { cause6 = c; evidence.cause = m[0]; break; }
  }

  const { areas, place } = areasOf(text);
  if (place) evidence.place = place;
  const sc = RE_SCALE.exec(text);

  return {
    relevant, kind,
    place_text: place, areas,
    occurred_clock: occurred ? clockStr(occurred) : null,
    eta,
    restored_clock: restored ? clockStr(restored) : null,
    cause6, scale_hint: sc ? sc[0] : null,
    evidence,
  };
}
