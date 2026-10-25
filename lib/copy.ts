// 숨시계 — 화면 문구 정본 (구현명세 §8). 화면은 문자열을 여기서만 가져온다.
// `{name}` 자리는 fill()로 채운다. 숫자는 lib/format.ts에서 만든 표시 문자열만 넣는다.
// C1a 뼈대: §8의 확정 문구를 옮겨 두었다. 이후 추가·수정은 C 묶음이 한다(다른 묶음은 Advisor 경유 요청).

import type { Cause6 } from "@/lib/types";

export function fill(template: string, values: Record<string, string | number>): string {
  // 자리 이름에 한글·콜론이 들어간다({경과}·{HH:MM}·{자원}) → \w가 아니라 중괄호 안 전부를 이름으로 본다.
  return template.replace(/\{([^{}]+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

// ───────── §8-0 용어 대응 (정식 용어 → 쉬운 말) ─────────
export const TERMS = {
  s_low: { formal: "잔여안전시간 하한", plain: "배터리로 버틸 시간(가장 짧게 잡은 값)" },
  p50: { formal: "복구시간 P50", plain: "보통은 이때 전기가 돌아옴" },
  p80: { formal: "복구시간 P80", plain: "10번 중 8번은 이 안에 전기가 돌아옴" },
  p90: { formal: "복구시간 P90", plain: "10번 중 9번은 이 안에 전기가 돌아옴" },
  s_exceed: { formal: "복구초과 확률 S(S_low)", plain: "배터리가 먼저 끝날 가능성" },
  margin: { formal: "잔여대응여유", plain: "여유 시간" },
  interrupted: { formal: "기능중단", plain: "기기가 멈춤" },
  ei: { formal: "예상 중단시간", plain: "기기가 멈출 수 있는 시간" },
  grade_a: { formal: "정보 등급 A", plain: "설명서 값" },
  grade_b: { formal: "정보 등급 B", plain: "기기 화면 값" },
  grade_c: { formal: "정보 등급 C", plain: "보호자 입력" },
  unknown: { formal: "미확정", plain: "모름 — 전화로 확인" },
  sine_ok: { formal: "정현파 AC · 출력 여유", plain: "의료기기에 써도 되는 전원" },
  waveform_unknown: { formal: "출력 파형 미확인 — 후보 제외", plain: "의료기기에 써도 되는지 확인 안 됨 → 보내지 않음" },
  r1: { formal: "단순 규칙(R1)", plain: "단순하게 보내면(남은 시간 짧은 집부터, 가까운 전원)" },
  llm_only: { formal: "LLM 단독", plain: "AI 챗봇에게만 맡기면" },
  synthetic: { formal: "합성 데이터", plain: "가상(합성) 데이터", plain_short: "가상" },
} as const;

export const COLORS = {
  stop: "#D92D20",       // + 「멈춤」
  ok: "#067647",         // + 「도착 전」
  changedText: "#B54708", changedBg: "#FEF0C7", // + 「바뀜」
  muted: "#667085",      // + 「제외」·「모름」
} as const;

// ───────── §8-1 공통 머리띠·첫 화면 `/` ─────────
export const COMMON = {
  serviceName: "숨시계",
  tagline: "정전 골든타임 AI",
  logoFull: "숨시계 | 정전 골든타임 AI",
  syntheticBand: "가구·기기 상태·비상전원은 시제품 검증용 합성 데이터입니다. 재난문자는 실제 공공 데이터, 기상은 재분석 자료입니다.",
  modeBadge: { ai: "AI 실시간", demo: "데모 모드 — AI 키 없이 규칙·사전계산으로 동작합니다" },
  reference: "참고용 시제품 — 최종 판단은 담당자가 합니다",
  referenceTag: "참고용",
  measuring: "측정 중",
  measuringTemp: "측정 중(임시)",
  measuringProvisional: "측정 중(임시 값)",
} as const;

export const HOME = {
  heroTitle: "숨시계",
  heroWho: "정전 재난 대응 도구 — 지자체 재난 담당자가 보호자 신고를 받아 비상전원 배정을 한 집씩 승인합니다",
  heroOneliner: "정전이 나도 숨이 멈추지 않게 — 인공호흡기를 쓰는 집의 배터리가 끝나기 전에 비상전원이 닿도록 AI가 계산하고, 담당자가 확인해 보냅니다.",
  implNote: "12번. 전력안심망 AI(제안자 아이디어)를 이번 대회를 위해 새로 구현한 시제품입니다.",
  deviceIllustration: { line1: "내장 배터리로 작동 중", line2: "남은 시간 3:10", corner: "그림: 예시 화면" },
  factsTitle: "실제로 있었던 일",
  factDoksan: {
    line1: "2026년 7월 29일 서울 독산동 정전 — 산소호흡기를 쓰던 루게릭병 환자가 병원으로 긴급 이송됐습니다.",
    line2: "이 정전은 재난문자 목록에 없습니다.",
    source: "금천in뉴스, 2026-08-03",
  },
  factMapo: {
    line1: "2026년 8월 14일 마포구 서교동 정전 — 재난문자는 정전 86분 뒤에 왔고, 전기가 돌아오기까지 약 3시간 50분이 걸렸습니다.",
    highlights: ["18:52경", "복구까지 3시간 소요예상", "22:40경 복구완료"],
    source: "행정안전부 재난안전데이터공유플랫폼 재난문자(마포구, 2026-08-14 20:18·22:49)",
  },
  factCorpus: "'정전'이 든 재난문자 {N}건({first}~{last}, 수집 {collected}) 가운데 발생과 복구가 모두 확인되는 사건은 {n_exact}건, 복구 문자는 있으나 시각이 없는 사건은 {n_int}건입니다.",
  personaCard: "이정민(가명) 씨 · 어머니가 인공호흡기를 24시간 씁니다 — 가상 인물",
  scenarioCards: {
    sc1: { title: "마포구 서교동 · 2026-08-14 저녁 · 고압선 단절", line: "실제 재난문자 기반 · 가상 가구 6곳" },
    sc2: { title: "안성시 고삼·대덕·양성면 · 2026-02-05 새벽", line: "실제 재난문자 기반 · 가상 가구 24곳 · 농촌 광역 정전" },
    sc3: { title: "대전 유성구 복용동 · 2026-08-18 오후 · 화재", line: "실제 재난문자 기반 · 가상 가구 8곳 · 복구 예고가 두 번 바뀜" },
  },
  toOps: "운영자 화면으로",
  reset: "시나리오 초기화",
  resetConfirm: "저장된 승인·입력을 모두 지웁니다",
  endBig: "AI는 계산하고, 사람이 결정합니다",
  endLimit: "가구·전원은 가상 데이터 · 복구시간은 한전 예측이 아닌 재난문자 기반 추정",
  url: "sumsigye.vercel.app",
  urlFull: "https://sumsigye.vercel.app",
  doksanUrl: "https://www.gcinnews.com/news/articleView.html?idxno=14675",
  sourceLabel: "출처",
  mapoSmsLabel: "재난문자 원문",
  scenariosTitle: "실제 재난문자 위에서 돌려 보기",
  evalTitle: "AI 성능 — 평가 결과 파일에서 읽은 값",
  githubLabel: "GitHub 저장소(코드·평가 자료)",
  githubUrl: "https://github.com/yonghwan1106/sumsigye",
  qrAlt: "sumsigye.vercel.app으로 가는 QR 코드",
  labLink: "AI 성능 자세히 보기",
  aboutLink: "데이터·원칙",
} as const;

// ───────── §8-2 운영자 `/ops` (B가 사용) ─────────
export const OPS = {
  slider: "판단 시각 {HH:MM} · 정전 뒤 {경과}",
  nextEvent: "다음 사건 ▶",
  reset: "시나리오 초기화",
  eventHead: "정전 사건(신고 기반)",
  eventHeadConfirmed: "정전 사건(신고 + 재난문자 확인)",
  reportItem: "{HH:MM} 보호자 신고 · {alias}",
  extractCols: { place: "장소", occurred: "발생", eta: "예고", restored: "복구", cause: "원인" },
  notInSms: "문자에 없음",
  etaUnknownBase: "{h}(기준 시각이 문자에 없음 → {a}~{b})",
  badgePrecomputed: "사전계산 재생 · claude-haiku-5-5",
  badgeLive: "실시간 AI",
  badgeRule: "규칙 추출(데모 모드)",
  distTicks: { p50: "보통은 {P50}", p80: "10번 중 8번 {P80}", p90: "10번 중 9번 {P90}" },
  distCaption: "실제 재난문자 사건 {n}건(발생·복구 확인 {n_exact} · 시각 없는 복구 {n_int} · 진행 중 {n_cens})으로 추정 · 한전 예측 아님",
  distCaptionMeasuring: "실제 재난문자 사건 수 측정 중 · 한전 예측 아님",
  etaLine: "기관 예고 {HH:MM}",
  etaProb: "예고 시각을 넘길 확률: {p}",
  etaProbUnknownBase: "발생 기준 {p1} · 발송 기준 {p2}",
  smallCellBadge: "복구시간 불확실 — 보수값(10번 중 9번) 적용 · 수동검토 권장",
  weatherCard: "기온 {t}℃ · 강수 {mm}mm · 바람 {ms}m/s — 기상: Open-Meteo.com(CC BY 4.0) 재분석 자료, 기상청 관측 아님",
  weatherHeat: "설명서: 35℃ 이상에서 충전이 멈출 수 있음",
  weatherNone: "기상 자료 없음(보정 1.0 가정)",
  pasteSms: "재난문자로 확인",
  extract: "추출",
  mapTitle: "가상 배치도(실제 위치 아님)",
  baseLabels: { gu: "구청(가상 위치)", center: "주민센터(가상 위치)", fire: "소방서(가상 위치)", rental: "의료기기 대여업체(가상)" },
  priorityTitle: "대응 우선순위·배정",
  lane119: "119 연계 검토",
  lane119Reason: { no_compatible: "배정 가능 자원 없음 — 119·이송 검토", late_arrival: "자원 도착 전 멈춤 예상 — 119·이송 검토", taken: "남은 호환 전원이 다른 가구에 배정됨 — 119·이송 검토" },
  restoredStatus: "복구됨(재난문자 기준 {HH:MM})",
  restoredStatusReceived: "복구됨(복구 문자 {HH:MM} 수신 기준 · 복구 시각은 문자에 없음)",
  timelineRestored: "복구됨",
  restoredNote: "정전이 복구되어 배정 재계산과 복구시간 예측을 멈췄습니다.",
  restoredFrozen: "아래 비교는 복구 전 마지막 판단 시각 {HH:MM} 기준입니다.",
  restoredDuration: "정전 지속 약 {d}",
  restoredRowApproved: "승인했던 전원: {r} — 회수 일정은 담당자가 정합니다",
  restoredRowNone: "승인된 전원 없음",
  arrivedLine: "{r} 도착 {HH:MM}(가정) · 남은 공급 약 {s} + 도착 때 기기 배터리 {b}",
  arrivedSafeNote: "도착한 전원 기준: 남은 공급 + 기기 배터리",
  btn119: "119 연계 승인",
  card119Title: "119 연계 카드 미리보기",
  card119Lines: ["위치: {area}(가상)", "사용 기기: {device}", "예상 안전시간: {safe}"],
  laneManual: "수동확인 필요",
  laneManualReason: { unknown: "모름 — 전화로 확인", conflict: "값 상충 — 수동확인" },
  manualNote: "확인 전에는 즉시 필요로 계산",
  btnPhone: "전화 확인 값 입력",
  tableHead: ["대응 우선순위", "가구", "기기", "잔여안전시간 하한(배터리로 버틸 시간)", "배터리가 먼저 끝날 가능성", "잔여대응여유(여유 시간)", "추천 전원·도착", "기기 멈출 수 있는 시간(배정 전→후)", "결정"],
  grades: { A: "설명서 값", B: "기기 화면 값", C: "보호자 입력", assumed: "가정값 사양" },
  extExcluded: "미검증 외장배터리 +약 {h}(계산 제외)",
  exclusion: {
    unavailable: "사용 불가(출동 중)",
    low_soc: "잔량 부족(20% 이하)",
    waveform_unknown: "의료기기에 써도 되는지 확인 안 됨 → 보내지 않음",
    connector: "전용 커넥터가 맞지 않음",
    input_mismatch: "기기 입력 형식과 맞지 않음",
    power_short: "출력 부족(필요 {w}W)",
  },
  supplyFootnote: "정격 전력 기준 · 실제 공급 시간은 더 길 수 있음",
  btnApprove: "승인", btnChange: "변경 ▾", btnHold: "보류",
  status: { proposed: "승인 전 제안", approved: "승인됨 {HH:MM}", held: "보류", reapprove: "재승인 필요", arrived: "전원 도착(가정) · 공급 중" },
  whyTitle: "왜 이 배정인가",
  compareTitle: "단순하게 보내면 vs 숨시계",
  compareBig: "기기 멈춤 예상 가구(이 시나리오): 단순하게 보내면 {r}곳 · 숨시계 {o}곳",
  expand: "크게 보기",
  close: "닫기",
} as const;

// ───────── §7-3 운영자 메모 템플릿(LLM 없을 때·검사 실패 때) ─────────
export const BRIEF = {
  withResource: "{alias}: 배터리 {safe}, 복구가 늦어질 가능성 {prob} → {resource} {arrival} 도착 제안",
  noResource: "{alias}: 배터리 {safe}, 복구가 늦어질 가능성 {prob} → 배정 가능한 전원 없음 — 119 연계 검토",
  manual: "{alias}: 값 확인 필요 — 전화 확인 먼저(확인 전에는 즉시 필요로 계산)",
  noNeed: "{alias}: 배터리 {safe}, 복구가 늦어질 가능성 {prob} → 지금은 배정 안 함",
  manualTail: " · 값 확인 필요(전화 확인)",
  none: "표시할 가구가 없습니다",
  // 한 가구 펼침(「왜 이 배정인가」 3줄)
  rowSafe: "{alias}: 배터리로 버틸 시간 {safe} · 배터리가 먼저 끝날 가능성 {prob} · 여유 시간 {margin}",
  rowResource: "추천 전원: {resource} · {arrival} 뒤 도착",
  rowNoResource: "배정 가능한 전원 없음 — 119 연계 검토",
  rowNoNeed: "지금은 배정 안 함 — 배터리가 먼저 끝날 가능성이 낮음",
  rowManual: "모르거나 서로 다른 값 — 전화 확인 먼저(확인 전에는 즉시 필요로 계산)",
  rowExcluded: "제외: {list}",
  rowNoExcluded: "제외된 전원 없음",
  rowChanged: "새 재난문자로 제안이 바뀜",
} as const;

// ───────── B 화면 보조 문구(/ops·/home, components/ops/copyB.ts에서 옮김) ─────────
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
  homeLink: "보호자 화면",
  homeSubmit: "입력 보내기",
} as const;

// ───────── §8-3 보호자 `/home/[hid]` (B가 사용) ─────────
export const GUARDIAN = {
  head: "{alias} 가구 · 보호자 화면(가상)",
  registerTitle: "우리 집 기기 등록(미리)",
  selectDevice: "기기 종류를 고르세요",
  deviceOptions: {
    VENT_A: "인공호흡기 A계열(참고: ResMed Astral 100/150)",
    VENT_B: "인공호흡기 B계열(참고: Philips Trilogy 100)",
    O2_STAT: "거치형 산소발생기(참고: Philips EverFlo)",
    O2_PORT: "휴대용 산소발생기",
    SUCTION: "석션기",
    COUGH: "기침유발기",
    unknown: "목록에 없음/모름",
  },
  modelInput: "모델명을 알면 적어 주세요(예: Astral 150)",
  match: {
    manual: "설명서 값과 대조됨 — 가장 나쁜 조건에서 약 {h}",
    assumed: "가정값 사양(설명서 확인 전)",
    unknown: "목록에 없음 — 담당자가 전화로 확인합니다",
  },
  extTitle: "외장배터리",
  extOptions: { none: "없음", verified: "제조사 전용(목록 등록)", other: "다른 제품이거나 모름" },
  extUnverified: "확인되지 않은 배터리는 계산에서 뺍니다(호환 미확인)",
  extCharge: "충전 정도: 완충 · 절반 · 모름",
  extChargeOptions: { full: "완충", half: "절반", unknown: "모름" },
  report: "정전 신고",
  reported: "담당자에게 전달됐습니다",
  remainingInput: "기기 화면의 남은 시간",
  percentInput: "배터리 %",
  unknownBtn: "모름",
  inputHint: "기기마다 표시 방식이 달라요. 보이는 것만 넣으세요.",
  cardNeedAt: "비상전원이 필요한 시각: 약 {HH:MM}(보수적으로 잡은 값)",
  cardSafe: "배터리로 버틸 시간 {safe}",
  cardUnknown: "모르는 값이 있어 담당자가 전화로 확인할 수 있습니다",
  guideTitle: "지금 할 일",
  checklist: {
    c1VentA: "기기 화면의 배터리 경고를 확인하세요. '매우 낮음' 경고는 약 10분 남았다는 뜻입니다(인공호흡기 A계열 설명서 기준).",
    c1: "기기 화면의 배터리 경고를 확인하세요.",
    c2: "외장배터리가 있으면 설명서에 나온 방법으로 연결하세요.",
    c3O2: "거치형 산소발생기는 정전 즉시 멈춥니다. 예비 산소통이 있으면 의료진이 알려 준 방법대로 쓰세요.",
    c3: "기기를 평소 자리에 두고 전원선을 정리하세요.",
    c4: "휴대전화를 충전된 상태로 두고, 담당자 전화를 받을 수 있게 하세요.",
    c5: "남은 시간이 30분 이하이거나 숨쉬기가 평소와 다르면 바로 119에 전화하세요.",
  },
  support: {
    pending: "승인 대기",
    approved: "승인됨 · {자원} 약 {t} 뒤 도착(가정값)",
    none: "배정된 전원 없음 — 담당자가 119 연계를 검토하고 있습니다",
    noneTaken: "남은 전원이 다른 가구에 먼저 배정됨 — 담당자가 119 연계를 검토하고 있습니다",
    noNeed: "지금은 배정 안 함 — 배터리가 먼저 끝날 가능성이 낮음",
    arrived: "전원 도착(가정) · {자원} 공급 중 — 남은 공급 약 {t}",
    restored: "{상태} — 정전이 끝나 배정 계산을 멈췄습니다",
  },
  cardRestored: "정전 복구됨 — 기기가 전기로 다시 도는지 확인하세요",
  bottomLine: "생명유지장치를 쓰는 가구는 이미 전기요금 할인 대상으로 구분됩니다(찾기쉬운 생활법령). 실제 등록 연계는 이번 시제품 범위 밖입니다.",
} as const;

// ───────── §8-4 AI 성능 `/lab` + 평가 띠 ─────────
export const EVAL_BAND = {
  l1: "재난문자 읽기: 사람이 확인한 {g}건 중 시각 정확일치 {x}% (AI: claude-haiku-5-5)",
  l1Fallback: "재난문자 읽기: 근거 문구 원문 일치 {x}% ({n}건, 사람 검수 전)",
  l2: "복구시간 '10번 중 8번' 범위에 실제 복구가 든 사건 {a}/{n}건 (95% 구간 {lo}~{hi}%)",
  l4: "합성 시나리오 400개: 기기 멈춤 가구 평균 {b}곳 → {a}곳 (단순하게 보내면 → 숨시계)",
  /** 효과 범위(l4_results.json diffs R1−ours): 95% 구간이 0을 넘으면 효과, 0을 품으면 차이 없음 */
  scopeFewer: "{name}에서 {v}곳 적음(95% 구간 {lo}~{hi})",
  scopeMore: "{name}에서 {v}곳 많음(95% 구간 {lo}~{hi})",
  scopeNone: "{name}: 차이 없음({v}곳, 95% 구간 {lo}~{hi})",
  scopeNames: { wide: "광역(가구 20~50곳)", small: "소규모(가구 4~8곳)" },
} as const;

export const LAB = {
  labelSentence: "정답 라벨: 동결한 규칙 추출기 출력으로 초벌한 뒤 응모자(박용환)가 원문을 보며 {g}건을 전수 검수했습니다. AI(LLM) 출력으로 초벌하지 않았고, 정답은 규칙을 만들기 전에 따로 떼어 두었습니다(커밋 순서로 확인 가능).",
  labelFallback: "사람 검수 전이라 정확도는 싣지 않았습니다. 자동 검증 지표만 보입니다.",
  preReviewTitle: "정답 라벨 검수 전 — 규칙 추출기 대비 일치율",
  selectedModel: "선택 모형: {M}",
  lrLine: "야간: χ²={c1}, p={p1} / 원인군: χ²={c2}, p={p2}",
  lrNotConfirmed: "원인별 차이는 표본이 작아 확인하지 못했습니다",
  reviewLine: "사람 검수: 자동 연결 {n0}건 → 검수 후 {n1}건(제외 {k}건)",
  scenarioHoldout: "시나리오 사건(마포 2026-08-14·유성 2026-08-18)은 시험 구간에 있으며, 시나리오 화면은 그 사건을 뺀 모형으로 그렸습니다",
  ladder: "복구시간 모형 대신 고정 2시간 가정을 넣으면: 기기 멈춤 가구 차이 {d}곳(95% 구간 {lo}~{hi}, 고정 2시간 가정 − 숨시계 · 음수면 고정 2시간 가정이 더 적음)",
  l2Interpret: "해석: 선택 모형({m})의 분위 오차 평균은 {mv}이며, 단순 기준선(고정 2시간 {b0} · 관측 경험분위 {b1} · 기관 예고 {b2}, 기관 예고는 {n2}건)보다 큽니다. '10번 중 8번' 범위가 평균 {w}에 이를 만큼 넓어서 적중 {a}/{n}건이 나온 것이며, 복구 시각을 잘 맞힌다는 뜻이 아닙니다. 숨시계는 이 범위를 보수적인 대응 기준으로만 씁니다.",
  l4Scope: "해석 ① 단순하게 보내면보다 기기 멈춤 가구가 적은 것은 시나리오 규모에 따라 다릅니다: {scope}.",
  l4Ladder: "해석 ② 같은 배정 계산에 복구시간 모형 대신 고정 2시간을 넣으면 멈춤 가구가 {d}곳 더 적습니다. 이 평가에서 복구시간 모형은 배정을 개선하지 않았고, 단순하게 보내면보다 나은 부분은 호환·잔량·도착을 함께 푸는 배정 계산에서 나옵니다.",
  l4Lex: "해석 ③ 배정은 멈춤 가구 수를 먼저 줄이고 그다음 멈춤 시간을 줄이는 사전식이라, 멈춤 시간 평균은 숨시계가 더 깁니다(숨시계 {o} · 단순하게 보내면 {r}).",
  l4Conservative: "해석 ④ 복구시간 모형은 범위를 넓게(보수적으로) 잡아, 에너지 부족 배정({e}건)과 「모름」 가구가 가져간 전원 비율({u})은 오라클을 뺀 방법 가운데 가장 낮습니다.",
  /** l4_results.json methods[].label (scripts/eval-alloc.ts가 넣는다) */
  methods: {
    R1: "단순하게 보내면(남은 시간 짧은 집부터, 가까운 전원)",
    R2: "가까운 순",
    R3: "호환 무시",
    A1: "고정 2시간 가정",
    ours: "숨시계",
    ORACLE: "실제 복구시간을 아는 경우(오라클)",
    LLM_HAIKU: "AI 챗봇에게만 맡기면(claude-haiku-5-5)",
    LLM_SONNET: "AI 챗봇에게만 맡기면(claude-sonnet-5)",
  },
  /** l4_sensitivity.json rows[].label */
  sens: {
    base: "기본 가정값",
    tail15: "복구시간 꼬리 ×1.5(참값 지속시간 × 1.5)",
    test_only: "시험 구간(2026-07-01 이후) 사건만",
    self_lo: "보호자 입력 감가 15% → 7.5%",
    self_hi: "보호자 입력 감가 15% → 22.5%",
    age_lo: "노후 감가 연 10% → 5%",
    age_hi: "노후 감가 연 10% → 15%",
    speed_lo: "이동 속도 ×0.5",
    speed_hi: "이동 속도 ×1.5",
    prep_lo: "출동 준비 10분 → 5분",
    prep_hi: "출동 준비 10분 → 15분",
    mismatch: "불일치: 엔진은 25km/h, 실제 속도만 ×0.5",
  },
} as const;

// ───────── §8-5 데이터·원칙 `/about` ─────────
export const ABOUT = {
  paragraphs: [
    "숨시계는 정전 때 담당자가 판단할 근거를 계산할 뿐, 누구를 먼저 살릴지 정하지 않습니다. 배정은 담당자가 한 집씩 승인해야 확정됩니다.",
    "전력 사용 패턴(AMI) 분석은 쓰지 않습니다. 정전 사실은 보호자 신고로 시작하고, 재난문자는 확인과 복구시간 근거로 씁니다.",
    "평시 집계·선배치 지원은 고도화 단계로 남겼습니다.",
    "해외에는 전력의존 가구에 비상전원을 미리 지원하는 사업이 있습니다(미국 PG&E Portable Battery Program, 일본 이나기시 재가 인공호흡기 사용자 재해 지원). 국내 같은 사업은 확인하지 못했습니다.",
  ],
  implNote: "12번. 전력안심망 AI(제안자 아이디어)를 이번 대회를 위해 새로 구현",
} as const;

// ───────── §8-6 두 막대 경주 ─────────
export const RACE = {
  title: "배터리가 먼저 끝날까, 전기가 먼저 돌아올까?",
  barSafe: "배터리로 버틸 시간(가장 짧게 잡은 값)",
  barRestore: "전기 돌아올 시간(10번 중 8번은 이 안에)",
  marker: "비상전원 도착",
  left: "단순하게 보내면(남은 시간 짧은 집부터, 가까운 전원)",
  right: "숨시계",
  resultStop: "기기 멈춤 {m}",
  resultOk: "배터리 끝나기 {k} 전 도착",
  resultNone: "보낼 수 있는 전원 없음",
  band: "가상 시나리오 400개 평균: 기기 멈춤 가구 {b}곳 → {a}곳",
  footnote: "값은 모두 엔진 계산 결과입니다. {alias}은 가상 가구입니다.",
  footnoteEval: "평가 시나리오 #{seed}",
  empty: "어느 쪽이 먼저 끝날까?",
  posterSub: "정전 때 인공호흡기 집의 남은 배터리와 전기 돌아올 시간을 견주어, 비상전원이 제때 닿게 돕는 AI",
  posterCorner: "가상 데이터",
} as const;

// ───────── §8-4 `/lab` 화면 문구 ─────────
export const LAB_PAGE = {
  title: "AI 성능",
  intro: "아래 숫자는 모두 저장소의 평가 결과 파일(data/eval/*.json)에서 읽습니다. 숨시계에 불리한 결과도 지우지 않았습니다.",
  s1: "1. 재난문자 읽기",
  s2: "2. 복구시간 분포",
  s3: "3. 비상전원 배정",
  s4: "4. 데이터 출처",
  s5: "5. 한계",
  s6: "6. 코드·자료",
  l1Cols: ["방식", "관련 F1", "종류", "시각 정확일치", "빈 값 정답률", "예고 기준 시각", "원인 6", "원인 3", "연결 정밀도/재현율"],
  l1VsRuleCols: ["방식", "문자 수", "관련 F1(규칙과)", "종류 일치", "시각 일치", "빈 값 일치", "예고 기준 시각 일치", "원인 6 일치", "원인 3 일치"],
  l1VsRuleNote: "개발용 문자(정답용으로 떼어 둔 문자는 빼고)에서 동결한 규칙 추출기(r1) 출력과 견준 일치율입니다. 정답(사람 검수) 대비 정확도가 아닙니다.",
  l1AutoCols: ["방식", "확인한 문자", "근거 문구 원문 일치", "시각 형식 통과"],
  l1AutoTitle: "자동 검증(검수 없이 계산)",
  systems: { rule: "규칙(r1 동결)", "claude-haiku-5-5": "claude-haiku-5-5", "claude-sonnet-5": "claude-sonnet-5" } as Record<string, string>,
  l2Cols: ["모형·기준선", "사건 수", "분위 오차 평균(pinball)", "10번 중 8번 범위 평균", "80% 범위 적중(95% 구간)", "90% 범위 적중(95% 구간)"],
  l2Labels: { M0: "M0 전체", M1: "M1 야간", M2: "M2 원인군 3+야간", B0: "고정 2시간", B1: "관측 경험분위", B2: "기관 예고" } as Record<string, string>,
  intervalLine: "복구 시각이 없는 사건 {n}건: '10번 중 8번' 범위 안 {hit} · 벗어남 {miss} · 판정 불가 {und}",
  timeSplitTitle: "시간 분할(보조): 2026-07-01 앞 사건으로 학습, 뒤 사건으로 시험",
  timeSplitCols: ["모형·기준선", "분위 오차 평균(pinball)", "80% 범위 적중(95% 구간)"],
  timeSplitN: "학습 {train}건 · 시험 {test}건",
  preReview: "사람 검수 전(자동 규칙)",
  plotTitle: "사건 표시: 점 = 발생·복구 확인 · 막대 = 복구 시각 없는 사건의 범위 · 화살표 = 진행 중 · 선 = 선택 모형(경과 0)에서 아직 복구 안 됐을 확률",
  plotAxis: "정전 뒤 시간",
  plotHour: "{h}시간",
  bias: "재난문자가 발송된 정전만 들어 있습니다. 짧은 정전과 문자 없는 정전(예: 2026-07-29 독산동)은 빠져 있고, 복구 안내를 보내는 일부 기관에 표본이 몰려 있습니다.",
  l4Tabs: { small: "소규모 200개", wide: "광역 200개", all: "전체 400개" },
  l4Cols: ["방법", "기기 멈춤 가구 평균(95% 구간)", "멈춤 시간 평균", "호환 위반", "에너지 부족 배정", "「모름」 가구가 가져간 전원 비율"],
  diffTitle: "짝 차이(같은 시나리오에서 빼기, 95% 구간)",
  diffCols: ["비교", "소규모", "광역", "전체"],
  diffLabels: { "R1-ours": "단순하게 보내면 − 숨시계", "A1-ours": "고정 2시간 가정 − 숨시계", "ours-ORACLE": "숨시계 − 오라클" } as Record<string, string>,
  unitHouse: "{v}곳",
  ci: "{lo}~{hi}",
  llmTitle: "AI 챗봇에게만 맡기면(같은 30개 시나리오)",
  llmCols: ["방법", "시나리오", "응답 실패", "기기 멈춤 가구 평균(95% 구간)", "호환 위반 합"],
  llmOkOnly: "응답에 성공한 시나리오만 놓고 보면({model}, {n}개): AI 챗봇 {llm}곳 · 숨시계 {ours}곳 · 단순하게 보내면 {r1}곳(기기 멈춤 가구 평균, 같은 시나리오)",
  llmPending: "측정 중 — 데이터를 동결한 뒤 한 번만 실행합니다.",
  llmFailNote: "응답 실패 = 출력 상한({t}토큰) 안에 배정 JSON을 끝내지 못한 응답(빈 응답 포함, 다시 물어도 실패). 실패한 시나리오는 전부 미배정으로 채점했습니다. 호환 위반 합에는 목록에 없는 가구·자원을 적은 배정도 들어갑니다.",
  promptLink: "프롬프트 공개 사본(prompts/llm_alloc_baseline.md)",
  sensTitle: "민감도(가정값을 바꿨을 때 단순하게 보내면 − 숨시계)",
  sensCols: ["바꾼 가정", "숨시계", "단순하게 보내면", "차이(95% 구간)"],
  computeLine: "광역 시나리오(가구 20~50곳) 배정 평균 계산 시간 {ms}ms",
  limits: [
    "가구·기기 상태·비상전원은 합성 데이터입니다. 배정 효과 수치는 합성 시나리오에서 잰 값이며 실제 현장 성능이 아닙니다.",
    "복구시간 분포는 재난문자가 발송된 정전만으로 추정했습니다. 짧은 정전과 문자 없는 정전(예: 2026-07-29 독산동)은 빠져 있고, 복구 안내를 생략한 정전이 더 짧을 수 있어 편향이 남습니다.",
    "휴대용 산소발생기·석션기·기침유발기의 배터리 값과 이동 속도·출동 준비 시간은 가정값입니다.",
    "복구시간 모형과 배정 평가의 복구시간은 같은 재난문자 자료에서 나왔습니다. 평가에서는 뽑힌 사건을 뺀 모형으로 배정해 같은 사건으로 채점하지 않았습니다.",
  ],
  sourcesCols: ["자료", "내용", "이용 조건"],
  sources: [
    ["재난문자", "행정안전부 재난안전데이터공유플랫폼 재난문자 목록('정전' 검색), {n}건 · 수집 {collected}", "공공데이터법·개인정보보호법·저작권법에 따름, 출처 표기. 실종·배회 문자는 저장하지 않음"],
    ["기상", "Open-Meteo.com Historical Weather API — 시나리오 3건의 시간별 기온·강수·바람", "CC BY 4.0, 비상업 이용. 재분석 자료 — 기상청 관측 아님"],
    ["기기 설명서", "ResMed Astral 100/150 사용설명서(77·60·49쪽) · Philips Trilogy 100(쪽 미확인) · Philips Respironics EverFlo(18·21쪽)", "수치·짧은 구절 인용, 출처·쪽 표기. 특정 제품 추천 아님"],
    ["합성 데이터", "가구·기기 상태·비상전원·가상 인물(시드 고정 생성기)", "자체 생성 — 실제 가구·위치 아님"],
  ],
  repoLink: "GitHub 저장소",
  dataLinks: "평가 결과 파일",
  measuringTemp: "측정 중(임시)",
} as const;

// ───────── §8-5 `/about` 화면 문구 ─────────
export const ABOUT_PAGE = {
  title: "데이터·원칙",
  overseasLinks: [
    { label: "PG&E Portable Battery Program", url: "https://www.pge.com/en/account/billing-and-assistance/financial-assistance/portable-battery-program.html" },
    { label: "이나기시(稲城市) 재가 인공호흡기 사용자 재해 지원", url: "https://www.city.inagi.tokyo.jp/en/kenko/syougaifukushi/1003553/1010571.html" },
  ],
  principlesTitle: "제안자 원칙과 숨시계",
  principlesCols: ["제안자 답변서(쪽)", "구분", "숨시계에서 지키는 곳"],
  principles: [
    ["「가구별 대응 우선순위를 산출하는 기능이 원안의 최소 구현 핵심」(1-1)", "요구", "운영자 표의 기본 정렬 = 잔여대응여유(여유 시간) 오름차순"],
    ["짧은 순·가까운 순만 표시로 끝내지 말 것(1-1)", "금지", "배터리 시간·복구시간·도착·호환을 함께 계산하고, 그 단순 규칙을 「단순하게 보내면」·「가까운 순」 기준선과 비교"],
    ["잔여안전시간 + 예상 복구/대체전력 도착 + 자원 호환·가용을 함께(1-1)", "요구", "배터리로 버틸 시간 규칙 + 복구시간 분포 + 호환·도착 제약 배정"],
    ["「실제 한전의 실시간 예측값이 아니라 … 가정값임을 명확히 표시」(1-2)", "요구", "복구시간 띠 고정 문구 「한전 예측 아님」"],
    ["정보 부족·상충 시 보수 산정 또는 수동확인(1-2, 2-3)", "요구", "「모름」·「값 상충」 → 수동확인 레인, 배정 계산에는 보수값 0분"],
    ["핵심 화면 = 운영자, 「잔여대응여유와 위험순위 … 확인하고 최종 배정 여부를 승인」(1-2)", "요구", "운영자 화면의 여유 시간 열·대응 우선순위 열, 한 집씩 승인(「모두 승인」 없음)"],
    ["신고·시연용 이벤트가 시작점, 공개 정전안내는 「보조적인 확인정보」(2-2)", "요구", "시나리오는 보호자 신고로 열리고, 재난문자는 확인·원인·예고·복구시간 표본으로만"],
    ["자가입력을 검증사양과 같은 신뢰도로 다루지 말 것, 미검증 외장배터리 전량 계산 금지(2-3)", "요구·금지", "보호자 입력 15% 감가, 미검증 외장배터리는 계산에서 빼고 회색으로만 표시"],
  ],
  paramsTitle: "가정값(엔진 기본값 — 모두 가정)",
  paramsCols: ["가정값", "값"],
  paramsDesc: {
    self_discount: "보호자 입력 감가", age_per_year: "노후 감가(연)", age_floor: "노후 계수 하한", age_unknown_factor: "사용 연수 모를 때 계수",
    alarm_margin_min: "경보 여유(분)", prep_min: "출동 준비(분)", road_factor: "직선거리→도로 계수", speed_urban_kmh: "도심 속도(km/h)",
    speed_rural_kmh: "농촌 속도(km/h)", rain_factor: "강수 시 도착 계수", wind_factor: "강풍 시 도착 계수", wind_threshold_ms: "강풍 기준(m/s)",
    conv_eff: "변환 효율", soc_min: "자원 최소 잔량", peak_margin: "피크 미상 기기 출력 여유", o2_peak_mult: "산소발생기 피크 배수",
    lane119_pmin: "119 연계 검토 기준 확률", small_cell_n: "칸 표본 적음 기준(건)", q_main: "주 분위(10번 중 8번)", q_small: "표본 적을 때 분위(10번 중 9번)",
  } as Record<string, string>,
  synthTitle: "합성 데이터 비율(가정값)",
  synth: [
    "기기 구성: 인공호흡기 A계열 35% · B계열 15% · 거치형 산소발생기 25% · 휴대용 산소발생기 10% · 석션기 10% · 기침유발기 5%",
    "관측 정보: 기기 화면 값 40%(그중 30%는 % 표시) · 보호자 입력만 40% · 모름 10% · 값 상충 10%",
    "외장배터리: 30% 보유, 그중 절반 검증(목록 등록) · 절반 미검증(실제 사용 가능 50%)",
    "자원: 가용 90% · 잔량 50~100% · 거점은 구청·주민센터·소방서·대여업체(모두 가상 위치)",
  ],
  sourcesTitle: "출처",
} as const;
