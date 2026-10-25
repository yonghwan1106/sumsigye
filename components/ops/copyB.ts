// B 화면(/ops·/home)에 필요하지만 lib/copy.ts(C 소유)에 아직 없는 짧은 문구.
// TODO(owner C): lib/copy.ts로 옮긴 뒤 이 파일은 그쪽을 다시 내보내게 바꾼다. 화면은 이 파일과 lib/copy.ts에서만 문자열을 가져온다.
import type { Cause6 } from "@/lib/types";

export const CAUSE_LABEL: Record<Cause6, string> = {
  vehicle: "차량", equipment: "설비", fire: "화재", weather: "기상", overload: "과부하", work: "공사", unknown: "미상",
};

export const OPS_B = {
  zeroConfirmed: "0시간(사양 확인)",
  unknownValue: "모름 — 전화로 확인",
  arrivalLine: "{r} · 약 {t} 뒤 도착",
  supplyLine: "공급 약 {t}",
  noResource: "배정 전원 없음",
  eiArrow: "{a} → {b}",
  changed: "바뀜",
  excludedHead: "후보에서 뺀 전원",
  changePick: "다른 호환 전원 고르기",
  phoneMinutes: "남은 시간(시:분)",
  phonePercent: "배터리 %",
  phoneDevice: "기기",
  phoneSave: "저장",
  phoneCancel: "취소",
  phoneBad: "시:분(예: 1:30) 또는 0~100 사이 %를 넣어 주세요",
  timelineLabels: { occurred: "발생", report: "신고", sms: "문자", restored: "복구" },
  legendDevice: { vent: "● 인공호흡기", o2: "▲ 산소발생기", other: "■ 그 밖·모름" },
  legendProb: { high: "먼저 끝날 가능성 50% 이상", mid: "10~50%", low: "10% 미만", unknown: "모름" },
  legendLines: { proposed: "점선 = 승인 전 제안", approved: "실선 = 승인됨" },
  stubBadge: "임시 시나리오 묶음(사전계산 묶음 준비 전)",
  homeLink: "보호자 화면",
} as const;
