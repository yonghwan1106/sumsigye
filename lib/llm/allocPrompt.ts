// AI 챗봇 단독 배정 기준선 프롬프트 (구현명세 §5-5·§7-5) — scripts/eval-llm-baseline.ts가 쓴다(오프라인 전용).
// 공개 사본: prompts/llm_alloc_baseline.md (tests/api.test.ts가 대조).

export const ALLOC_MAX_TOKENS = 2000;

export const ALLOC_SYSTEM_PROMPT = `너는 지자체 재난 담당자의 비상전원 배정을 돕는다. 목표: 기기가 멈추는 가구 수를 가장 적게, 같으면 멈추는 시간 합을 가장 짧게. 제약: (1) 의료기기에는 정현파 AC 또는 같은 계열 전용 배터리만 (2) 출력 파형이 확인 안 된 발전기는 쓰지 않는다 (3) 연속 출력 ≥ 기기 피크 전력(피크 미상이면 정격 × 1.25, 기기 모름이면 640W) (4) 사용 불가·잔량 20% 이하 자원 금지 (5) 자원 1대 = 가구 1곳. 출력은 JSON만: [{"household":"H01","resource":"R03"|null}]`;
