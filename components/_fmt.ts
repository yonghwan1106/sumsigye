// 공용 컴포넌트용 표시 형식 어댑터 (구현명세 §8 머리: 분 → 「1시간 35분」, 확률 → 「30% 안팎」, 시각 → 「20:18」).
// TODO(B): lib/format.ts(B 소유)가 생기면 아래 구현을 지우고 그 함수를 다시 내보낸다. 규칙은 §8 그대로.

/** 분 → 「1시간 35분」(60분 미만 「35분」, 0 이하 「0분」). 소수 시간은 쓰지 않는다. */
export function fmtMin(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0분";
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}분`;
  return r === 0 ? `${h}시간` : `${h}시간 ${r}분`;
}

/** 확률 → 10% 단위 「30% 안팎」(0.05 미만 「5% 미만」, 0.95 초과 「95% 넘음」). */
export function fmtProb(p: number): string {
  if (!Number.isFinite(p)) return "모름";
  if (p < 0.05) return "5% 미만";
  if (p > 0.95) return "95% 넘음";
  return `${Math.round(p * 10) * 10}% 안팎`;
}

/** ISO(+09:00) → 「20:18」(서울 시각). */
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

/** 비율 0~1 → 「83%」(정수). */
export function fmtPct(r: number): string {
  return `${Math.round(r * 100)}%`;
}

/** 소수 한 자리(평균 가구 수 등). */
export function fmt1(x: number): string {
  return (Math.round(x * 10) / 10).toFixed(1);
}
