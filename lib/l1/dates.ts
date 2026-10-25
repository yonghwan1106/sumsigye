// 날짜 보정(구현명세 §4-3, 설계서 §4-1). 규칙·LLM은 시각 문자열만 내고, 날짜는 이 코드가 발송 시각 기준으로 붙인다.
import type { ISO, L1Raw, L1Resolved } from "../types";

const KST_MS = 9 * 3600 * 1000;

/** "2026-08-14T20:18:52+09:00" → epoch ms */
export function isoToMs(iso: ISO): number { return Date.parse(iso); }

/** epoch ms → "YYYY-MM-DDTHH:MM:SS+09:00" */
export function msToIso(ms: number): ISO {
  const d = new Date(ms + KST_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+09:00`;
}

/** "HH:MM"·"H:MM"(·"HH:MM:SS") → {h, m}. 형식이 틀리면 null. 24:00은 0:00으로. */
export function parseClock(clock: string | null | undefined): { h: number; m: number } | null {
  if (!clock) return null;
  const mm = String(clock).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!mm) return null;
  let h = Number(mm[1]); const m = Number(mm[2]);
  if (h === 24 && m === 0) h = 0;
  if (h > 23 || m > 59) return null;
  return { h, m };
}

/** 발송일(서울) 자정 epoch ms */
function kstMidnight(sentMs: number): number {
  const d = new Date(sentMs + KST_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - KST_MS;
}

const DAY = 86400000;

/** 발생·복구: 같은 날 그 시각, 발송보다 늦으면 하루 전. */
export function pastClock(clock: string | null, sentIso: ISO): ISO | null {
  const c = parseClock(clock);
  if (!c) return null;
  const sent = isoToMs(sentIso);
  let t = kstMidnight(sent) + (c.h * 60 + c.m) * 60000;
  if (t > sent) t -= DAY;
  return msToIso(t);
}

/** 예고(absolute): 발송 이후 가장 가까운 그 시각. 1~12시는 h와 h+12 중 발송 후 가장 가까운 쪽. */
export function futureClock(clock: string | null, sentIso: ISO): ISO | null {
  const c = parseClock(clock);
  if (!c) return null;
  const sent = isoToMs(sentIso);
  const mid = kstMidnight(sent);
  const hours = c.h >= 1 && c.h <= 12 ? [c.h, c.h === 12 ? 0 : c.h + 12] : [c.h];
  let best: number | null = null;
  for (const h of hours) {
    for (const dayOff of [0, 1]) {
      const t = mid + dayOff * DAY + (h * 60 + c.m) * 60000;
      if (t >= sent && (best === null || t < best)) best = t;
    }
  }
  return best === null ? null : msToIso(best);
}

/** L1Raw + 발송 시각 → L1Resolved (검증 전 값. validate.finalize가 이 함수를 부른다). */
export function resolve(raw: L1Raw, sent_at: ISO): L1Resolved {
  const warnings: string[] = [];
  const occurred_at = pastClock(raw.occurred_clock, sent_at);
  const restored_at = pastClock(raw.restored_clock, sent_at);
  let eta_at: ISO | null = null;
  let eta_range: [ISO, ISO] | null = null;
  const sentMs = isoToMs(sent_at);
  if (raw.eta && raw.eta.type === "absolute") {
    eta_at = futureClock(raw.eta.clock, sent_at);
  } else if (raw.eta && raw.eta.type === "duration") {
    const add = raw.eta.minutes * 60000;
    if (raw.eta.base === "occurrence") {
      if (occurred_at) eta_at = msToIso(isoToMs(occurred_at) + add);
      else { eta_range = [msToIso(sentMs + add), msToIso(sentMs + add)]; warnings.push("eta_base_occurrence_without_occurred"); }
    } else if (raw.eta.base === "sent") {
      eta_at = msToIso(sentMs + add);
    } else {
      if (occurred_at) eta_range = [msToIso(isoToMs(occurred_at) + add), msToIso(sentMs + add)];
      else { eta_range = [msToIso(sentMs + add), msToIso(sentMs + add)]; warnings.push("eta_unknown_base_without_occurred"); }
    }
  }
  return { ...raw, occurred_at, restored_at, eta_at, eta_range, warnings };
}
