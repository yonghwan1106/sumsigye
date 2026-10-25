// L1 필드 병합 (구현명세 §5-1 끝): haiku-5-5 시각 정확일치 < rule이면 /api/extract는 「시각 = 규칙, 나머지 = LLM」.
import type { L1Resolved } from "@/lib/types";

/** 필드 병합(§5-1): 시각 = 규칙, 나머지 = LLM. */
export function mergeTimes(llm: L1Resolved, rule: L1Resolved): L1Resolved {
  const evidence = { ...llm.evidence };
  for (const k of ["occurred", "eta", "restored"] as const) {
    if (rule.evidence[k]) evidence[k] = rule.evidence[k];
    else delete evidence[k];
  }
  return {
    ...llm,
    occurred_clock: rule.occurred_clock,
    eta: rule.eta,
    restored_clock: rule.restored_clock,
    occurred_at: rule.occurred_at,
    restored_at: rule.restored_at,
    eta_at: rule.eta_at,
    eta_range: rule.eta_range,
    evidence,
    warnings: [...llm.warnings, "merged_times_from_rule"],
  };
}
