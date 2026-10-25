// 사건 연결·사건표(구현명세 §4-6, 설계서 §4-2). 결정적 규칙만 쓴다(LLM 없음).
import type { CauseGroup, ISO, L1Resolved, L1Source, OutageEvent } from "../types";
import { GROUP_OF } from "../types";
import { isoToMs } from "./dates";

export interface LinkMsg { sn: number; sent_at: ISO; org: string | null; text: string; fields: L1Resolved; source: L1Source; }

const H = 3600000;
export const LINK_WINDOW_H = 30;
export const LINK_EMPTY_AREA_H = 6;
export const MAX_FIRST_SMS_DELAY_MIN = 720;

/** 지역 이름 비교용: 끝의 동·읍·면·리를 떼고 공백 제거(「고삼」=「고삼면」) */
export const areaKey = (a: string) => a.replace(/\s+/g, "").replace(/(동|읍|면|리)$/, "");

/** 번지 표기(「서교동 325-25」「통일로 767」「갈현동 415-18」) */
export function lotsOf(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/([가-힣0-9]+(?:동|로|길|리|가))\s*(?:산\s*)?(\d+(?:-\d+)?)/g)) out.add(`${m[1]}${m[2]}`);
  return [...out];
}

function areasMatch(a: LinkMsg, b: LinkMsg, dtH: number): boolean {
  const ka = new Set(a.fields.areas.map(areaKey)), kb = b.fields.areas.map(areaKey);
  if (kb.some((k) => ka.has(k))) return true;
  const la = new Set(lotsOf(a.text));
  if (lotsOf(b.text).some((l) => la.has(l))) return true;
  if ((a.fields.areas.length === 0 || b.fields.areas.length === 0) && dtH <= LINK_EMPTY_AREA_H) return true;
  return false;
}

/** relevant 문자 → 사건 묶음(같은 org, 앞 문자와 30시간 안, 지역 교집합·번지 일치·한쪽 지역 비었고 6시간 안). 복구 문자가 오면 닫는다. */
export function linkMessages(msgs: LinkMsg[]): LinkMsg[][] {
  const rel = msgs.filter((m) => m.fields.relevant && m.org).sort((a, b) => isoToMs(a.sent_at) - isoToMs(b.sent_at) || a.sn - b.sn);
  const groups: { msgs: LinkMsg[]; closed: boolean }[] = [];
  for (const m of rel) {
    const t = isoToMs(m.sent_at);
    let best: { msgs: LinkMsg[]; closed: boolean } | null = null;
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i];
      const last = g.msgs[g.msgs.length - 1];
      if (last.org !== m.org) continue;
      const dtH = (t - isoToMs(last.sent_at)) / H;
      if (dtH > LINK_WINDOW_H) continue;
      // 닫힌 사건에는 6시간 안의 중복 복구 안내만 붙인다
      if (g.closed && !(m.fields.kind === "restoration" && dtH <= LINK_EMPTY_AREA_H)) continue;
      if (!g.msgs.some((x) => areasMatch(x, m, (t - isoToMs(x.sent_at)) / H))) continue;
      best = g; break;
    }
    if (best) { best.msgs.push(m); if (m.fields.kind === "restoration") best.closed = true; }
    else groups.push({ msgs: [m], closed: m.fields.kind === "restoration" });
  }
  return groups.map((g) => g.msgs);
}

/** 같은 사건으로 묶인 sn 쌍 집합(키 "작은sn-큰sn") */
export function linkedPairs(groups: LinkMsg[][]): Set<string> {
  const s = new Set<string>();
  for (const g of groups) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) s.add(pairKey(g[i].sn, g[j].sn));
  return s;
}
export const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const SOURCE_RANK: Record<L1Source, number> = { gold: 4, "claude-sonnet-5": 3, "claude-haiku-5-5": 2, merged: 2, rule: 1 };

/** 사건 묶음 → OutageEvent (지속시간 정의: 설계서 §4-2 표) */
export function buildEvent(g: LinkMsg[]): OutageEvent {
  const msgs = g.slice().sort((a, b) => isoToMs(a.sent_at) - isoToMs(b.sent_at) || a.sn - b.sn);
  const flags: string[] = [];
  const areas: string[] = [];
  for (const m of msgs) for (const a of m.fields.areas) if (!areas.some((x) => areaKey(x) === areaKey(a))) areas.push(a);

  const withOcc = msgs.filter((m) => m.fields.occurred_at);
  const startMsg = withOcc[0] ?? null;
  const start_at = startMsg ? startMsg.fields.occurred_at : null;
  const startMs = start_at ? isoToMs(start_at) : null;
  if (withOcc.length > 1 && startMs !== null) {
    const spread = Math.max(...withOcc.map((m) => Math.abs(isoToMs(m.fields.occurred_at!) - startMs)));
    if (spread > 10 * 60000) flags.push("start_conflict_gt10m");
  }
  if (startMsg && startMsg.fields.kind === "eta_update") flags.push("eta_only_start");

  // 원인: 사건 안 문자 중 unknown이 아닌 첫 원인
  const c = msgs.find((m) => m.fields.cause6 !== "unknown");
  const cause6 = c ? c.fields.cause6 : "unknown";
  const group: CauseGroup = GROUP_OF[cause6];
  let night = false;
  if (start_at) { const h = Number(start_at.slice(11, 13)); night = h >= 22 || h < 6; }
  const wide = areas.length >= 2 || msgs.some((m) => /대규모|여러|일대/.test(m.fields.scale_hint ?? ""));

  const restMsgs = msgs.filter((m) => m.fields.kind === "restoration");
  const restWithTime = restMsgs.find((m) => m.fields.restored_at);
  let outcome: OutageEvent["outcome"] = "excluded";
  let exclude_reason: OutageEvent["exclude_reason"];
  let duration_h: number | null = null, lower_h: number | null = null, upper_h: number | null = null;

  if (startMs === null) { outcome = "excluded"; exclude_reason = "no_start_time"; }
  else if (restWithTime) {
    duration_h = round3((isoToMs(restWithTime.fields.restored_at!) - startMs) / H);
    if (duration_h <= 0) { flags.push("nonpositive"); outcome = "excluded"; exclude_reason = "invalid"; }
    else outcome = "exact";
  } else if (restMsgs.length) {
    const firstRest = restMsgs[0];
    // 진행 중 문자 = 첫 복구 문자보다 먼저 발송된, 복구가 아닌 같은 사건 문자(발생·예고·지연·주의 안내).
    // LLM이 「복구 중이니 유의하세요」를 advisory로 분류해도 그 시각에 정전이 이어지고 있었다는 근거는 같다.
    const prog = msgs.filter((m) => m.fields.kind !== "restoration" && isoToMs(m.sent_at) <= isoToMs(firstRest.sent_at));
    const lastProg = prog[prog.length - 1];
    upper_h = round3((isoToMs(firstRest.sent_at) - startMs) / H);
    lower_h = lastProg ? round3(Math.max(0, (isoToMs(lastProg.sent_at) - startMs) / H)) : 0;
    if (!lastProg) flags.push("no_progress_msg");
    if (upper_h <= 0 || upper_h < lower_h) { flags.push("nonpositive"); outcome = "excluded"; exclude_reason = "invalid"; }
    else outcome = "interval";
  } else {
    const prog = msgs.filter((m) => m.fields.kind !== "restoration");
    const lastProg = prog[prog.length - 1] ?? msgs[msgs.length - 1];
    lower_h = round3((isoToMs(lastProg.sent_at) - startMs) / H);
    if (lower_h <= 0) { flags.push("nonpositive"); outcome = "excluded"; exclude_reason = "invalid"; lower_h = null; }
    else outcome = "right";
  }
  const maxH = duration_h ?? upper_h ?? lower_h;
  if (maxH !== null && maxH > 72) flags.push("over72h");

  const first_sms_delay_min = startMs !== null ? Math.round((isoToMs(msgs[0].sent_at) - startMs) / 60000) : null;
  // 첫 문자가 발생보다 12시간 넘게 늦으면 날짜 보정 오류(예고된 미래 시각을 「하루 전 발생」으로 읽음)로 보고 제외한다.
  if (first_sms_delay_min !== null && first_sms_delay_min > MAX_FIRST_SMS_DELAY_MIN && outcome !== "excluded") {
    flags.push("start_gt12h_before_first_sms"); outcome = "excluded"; exclude_reason = "invalid";
  }
  const etaMsg = msgs.find((m) => m.fields.eta_at || m.fields.eta_range);
  const srcs = [...new Set(msgs.map((m) => m.source))];
  const field_source: L1Source = srcs.length === 1 ? srcs[0] : srcs.sort((a, b) => SOURCE_RANK[b] - SOURCE_RANK[a])[0];

  const ev: OutageEvent = {
    event_id: `E-${msgs[0].sn}`, org: msgs[0].org as string, sns: msgs.map((m) => m.sn), areas,
    start_at, start_sn: startMsg ? startMsg.sn : null,
    outcome, duration_h, lower_h, upper_h,
    cause6, group, night, wide, first_sms_delay_min,
    field_source, review: { status: "auto" }, flags,
  };
  if (exclude_reason) ev.exclude_reason = exclude_reason;
  if (etaMsg) ev.eta = { eta_at: etaMsg.fields.eta_at, eta_range: etaMsg.fields.eta_range, from_sn: etaMsg.sn };
  return ev;
}

/** 같은 기관·같은 날 시작 사건이 여럿이면 표시 */
export function flagSameOrgSameDay(events: OutageEvent[]): void {
  const key = (e: OutageEvent) => `${e.org}|${(e.start_at ?? "").slice(0, 10)}`;
  const cnt = new Map<string, number>();
  for (const e of events) if (e.start_at) cnt.set(key(e), (cnt.get(key(e)) ?? 0) + 1);
  for (const e of events) if (e.start_at && (cnt.get(key(e)) ?? 0) > 1 && !e.flags.includes("same_org_same_day_multi")) e.flags.push("same_org_same_day_multi");
}
