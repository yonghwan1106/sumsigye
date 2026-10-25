// 공용 컴포넌트용 표시 형식 — 정본은 lib/format.ts(B 소유, 구현명세 §8 머리 규칙). 여기서는 다시 내보내고
// 평가 표에만 쓰는 두 가지(정수 %·소수 한 자리)만 더한다.
export { fmtMin, fmtProb, fmtClock, fmtClockPlus, fmtSignedMin } from "@/lib/format";

/** 비율 0~1 → 「83%」(정수). */
export function fmtPct(r: number): string {
  return `${Math.round(r * 100)}%`;
}

/** 소수 한 자리(평균 가구 수 등). */
export function fmt1(x: number): string {
  return (Math.round(x * 10) / 10).toFixed(1);
}
