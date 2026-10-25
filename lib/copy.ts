// 숨시계 — 화면 문구 정본 (구현명세 §8). 화면은 문자열을 여기서만 가져온다.
// `{name}` 자리는 fill()로 채운다. 숫자는 lib/format.ts에서 만든 표시 문자열만 넣는다.
// C1a 뼈대: §8의 확정 문구를 옮겨 두었다. 이후 추가·수정은 C 묶음이 한다(다른 묶음은 Advisor 경유 요청).

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
  lane119Reason: { no_compatible: "배정 가능 자원 없음 — 119·이송 검토", late_arrival: "자원 도착 전 멈춤 예상 — 119·이송 검토" },
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
  status: { proposed: "승인 전 제안", approved: "승인됨 {HH:MM}", held: "보류", reapprove: "재승인 필요" },
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
  manual: "{alias}: {safe} — 전화 확인 먼저(확인 전에는 즉시 필요로 계산)",
  none: "표시할 가구가 없습니다",
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
  },
  bottomLine: "생명유지장치를 쓰는 가구는 이미 전기요금 할인 대상으로 구분됩니다(찾기쉬운 생활법령). 실제 등록 연계는 이번 시제품 범위 밖입니다.",
} as const;

// ───────── §8-4 AI 성능 `/lab` + 평가 띠 ─────────
export const EVAL_BAND = {
  l1: "재난문자 읽기: 사람이 확인한 {g}건 중 시각 정확일치 {x}% (AI: claude-haiku-5-5)",
  l1Fallback: "재난문자 읽기: 근거 문구 원문 일치 {x}% ({n}건, 사람 검수 전)",
  l2: "복구시간 '10번 중 8번' 범위에 실제 복구가 든 사건 {a}/{n}건 (95% 구간 {lo}~{hi}%)",
  l4: "합성 시나리오 400개: 기기 멈춤 가구 평균 {b}곳 → {a}곳 (단순하게 보내면 → 숨시계)",
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
  ladder: "복구시간 모형의 몫 = 고정 2시간 가정과 숨시계의 차이 {d}곳(95% 구간 {lo}~{hi})",
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
