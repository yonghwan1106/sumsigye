// 엔진 가정값(구현명세 §6-6 DEFAULT_PARAMS). 값의 정본은 lib/types.ts — 여기서는 다시 내보내고 덮어쓰기 도우미만 둔다.
import { DEFAULT_PARAMS, type EngineParams } from "../types";

export { DEFAULT_PARAMS };
export type { EngineParams };

/** 기본값에 일부만 덮어쓴 새 객체(민감도 분석용). */
export function withParams(over: Partial<EngineParams> = {}): EngineParams {
  return { ...DEFAULT_PARAMS, ...over };
}

/** 기기 「모름」 가구의 요구 출력(사양 DB 최대 요구치, 거치형 산소발생기 피크 640W). */
export const UNKNOWN_DEVICE_NEED_W = 640;
/** 기기 「모름」 가구의 공급 시간 계산에 쓰는 정격 전력(사양 DB 최대 정격, 320W). */
export const UNKNOWN_DEVICE_RATED_W = 320;
/** 기온 주의 배지 기준(설명서: 35℃ 이상에서 충전이 멈출 수 있음). 값은 바꾸지 않는다. */
export const HEAT_BADGE_C = 35;
/** 「값 상충」 판정: 기기 화면 값(B)과 보호자 입력(C)이 B 기준으로 30% 넘게 다르면. */
export const CONFLICT_REL = 0.3;
/** 예비 산소통 입력 시간에 곱하는 보수 계수(설계서 §4-3 규칙 9). */
export const SPARE_O2_FACTOR = 0.85;
