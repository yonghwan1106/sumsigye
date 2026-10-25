// 시각 도우미: 모든 시각 문자열은 +09:00 ISO. 엔진은 분 단위로만 계산한다.
import type { ISO } from "../types";

export function isoMs(t: ISO): number {
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) throw new Error(`bad ISO: ${t}`);
  return ms;
}

/** b − a (분). */
export function minutesBetween(a: ISO, b: ISO): number {
  return (isoMs(b) - isoMs(a)) / 60000;
}

/** ms → "+09:00" ISO(초 단위). */
export function toKstIso(ms: number): ISO {
  const d = new Date(ms + 9 * 3600000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+09:00`;
}

export function addMinutes(t: ISO, min: number): ISO {
  return toKstIso(isoMs(t) + min * 60000);
}
