// 숫자 표시(구현명세 §8 머리): 분 → 「1시간 35분」(60분 미만 「35분」), 확률 → 10% 단위 「30% 안팎」
// (0.05 미만 「5% 미만」, 0.95 초과 「95% 넘음」), 시각 → 「20:18」(서울 시각). 소수 시간은 쓰지 않는다.

/** 분 → 「1시간 35분」(60분 미만 「35분」, 0 이하 「0분」). */
export function fmtMin(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0분";
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}분`;
  return r === 0 ? `${h}시간` : `${h}시간 ${r}분`;
}

/** 확률 → 「30% 안팎」. */
export function fmtProb(p: number): string {
  if (!Number.isFinite(p)) return "모름";
  if (p < 0.05) return "5% 미만";
  if (p > 0.95) return "95% 넘음";
  return `${Math.round(p * 10) * 10}% 안팎`;
}

/** ISO(+09:00) → 「20:18」. */
export function fmtClock(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms + 9 * 3600000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** ISO + 분 → 「20:18」. */
export function fmtClockPlus(iso: string, min: number): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return fmtClock(new Date(ms + min * 60000).toISOString());
}

/** 잔여대응여유처럼 음수가 뜻이 있는 분 값 → 「−35분」/「1시간 5분」. */
export function fmtSignedMin(min: number): string {
  if (!Number.isFinite(min)) return "—";
  return min < 0 ? `−${fmtMin(-min)}` : fmtMin(min);
}

/** 시:분 입력 「3:10」 → 190분. 형식이 틀리면 null. */
export function parseHm(s: string): number | null {
  const m = /^\s*(\d{1,2})\s*[:시]\s*(\d{1,2})\s*분?\s*$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (mi >= 60) return null;
  return h * 60 + mi;
}
