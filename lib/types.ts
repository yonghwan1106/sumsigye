// 숨시계 — 묶음 사이 인터페이스 계약 (구현명세 §6-1 ~ §6-10 그대로)
// 이 파일의 변경은 Advisor 승인 뒤에만 한다.
// 시간: 엔진 안에서는 분(min), L2 모형 파일(restore_model.json)에서만 시간(h). 시각 문자열은 모두 +09:00 ISO.

// ───────────────────────── §6-1 공통 ─────────────────────────
export type ISO = string;                       // "2026-08-14T18:52:00+09:00"
export type Cause6 = "vehicle"|"equipment"|"fire"|"weather"|"overload"|"work"|"unknown";
export type CauseGroup = "G1"|"G2"|"G3";        // G1 vehicle·equipment·work / G2 weather·fire / G3 overload·unknown
export const GROUP_OF: Record<Cause6, CauseGroup> = { vehicle:"G1", equipment:"G1", work:"G1", weather:"G2", fire:"G2", overload:"G3", unknown:"G3" };
export type SmsKind = "occurrence"|"eta_update"|"restoration"|"advisory"|"other";
export interface SmsRow { sn: number; sent_at: ISO; org: string|null; text: string; split: "dev"|"gold"; fixture: boolean; }

// ───────────────────────── §6-2 L1 ─────────────────────────
export type EtaRaw =
  | { type: "absolute"; clock: string }                                   // "18:00", "3:00"
  | { type: "duration"; minutes: number; base: "occurrence"|"sent"|"unknown" }
  | null;
export interface L1Raw {
  relevant: boolean; kind: SmsKind;
  place_text: string|null; areas: string[];
  occurred_clock: string|null; eta: EtaRaw; restored_clock: string|null;
  cause6: Cause6; scale_hint: string|null;
  evidence: Partial<Record<"kind"|"place"|"occurred"|"eta"|"restored"|"cause", string>>;
}
export interface L1Resolved extends L1Raw {
  occurred_at: ISO|null; restored_at: ISO|null;
  eta_at: ISO|null;               // absolute 또는 base가 정해진 duration
  eta_range: [ISO, ISO]|null;     // base unknown → [발생+분, 발송+분]
  warnings: string[];
}
export type L1Source = "rule"|"claude-haiku-5-5"|"claude-sonnet-5"|"gold"|"merged";
export interface L1Result { sn: number; source: L1Source; rule_version?: string; fields: L1Resolved; }
// data/l1/extract_*.json = { meta:{source, model?, rule_version?, built_at, n}, items: L1Result[] }
export interface L1ExtractFile { meta: { source: L1Source; model?: string; rule_version?: string; built_at: ISO; n: number }; items: L1Result[]; }

// ───────────────────────── §6-3 골드·연결 골드 ─────────────────────────
// data/eval/l1_gold.json
export interface L1Gold { meta: { labeler: "applicant"|"none"; method: "rule_draft_then_full_review"|"none";
  draft_source: "rule:r1"; reviewed_n: number; total_n: number; ingested_at: ISO; csv_sha256: string };
  items: { sn: number; order: number; reviewed: boolean; changed: boolean; fields: L1Raw }[]; }
// data/eval/link_gold.json
export interface LinkGold { meta: { reviewed_n: number; ingested_at: ISO }; pairs: { pair_id: string; sn_a: number; sn_b: number; same_event: boolean|null }[]; }

// ───────────────────────── §6-4 사건표 (TS → Python) ─────────────────────────
export interface OutageEvent {
  event_id: string;                       // "E-<첫 sn>"
  org: string; sns: number[]; areas: string[];
  start_at: ISO|null; start_sn: number|null;
  outcome: "exact"|"interval"|"right"|"excluded";
  exclude_reason?: "no_start_time"|"reviewer"|"invalid";
  duration_h: number|null;                // exact
  lower_h: number|null; upper_h: number|null;   // interval: 둘 다 / right: lower만
  cause6: Cause6; group: CauseGroup; night: boolean; wide: boolean;
  first_sms_delay_min: number|null;       // 첫 문자 발송 − start
  eta?: { eta_at: ISO|null; eta_range: [ISO,ISO]|null; from_sn: number };
  field_source: L1Source;
  review: { status: "auto"|"ok"|"fixed"|"excluded"; note?: string };
  flags: string[];
}
// data/events/events.json = { meta:{built_at, n_by_outcome:{exact,interval,right,excluded}, reviewed:boolean, n_before_review:number|null, n_after_review:number|null, sources:Record<L1Source,number>}, events: OutageEvent[] }
export interface EventsFile {
  meta: { built_at: ISO; n_by_outcome: { exact: number; interval: number; right: number; excluded: number };
    reviewed: boolean; n_before_review: number|null; n_after_review: number|null; sources: Record<L1Source, number> };
  events: OutageEvent[];
}

// ───────────────────────── §6-5 복구시간 모형 (Python → TS) data/model/restore_model.json ─────────────────────────
export interface LnModel { coef: Record<"intercept"|"night"|"G2"|"G3", number>; sigma: number; loglik?: number; k?: number; }
export interface RestoreModelFile {
  provisional: boolean; reviewed: boolean; version: string; fitted_at: ISO;
  data: { n_exact: number; n_interval: number; n_right: number; n_excluded: number; period: [ISO, ISO]; corpus_n: number; collected_at: ISO };
  models: { M0: LnModel; M1?: LnModel; M2?: LnModel };
  selected: "M0"|"M1"|"M2";
  lr_tests: { model: string; vs: string; chi2: number; df: number; p: number }[];
  cells: { group: CauseGroup|"all"; night: boolean|"all"; n_cell: number; small: boolean; mu: number; sigma: number; p50_h: number; p80_h: number; p90_h: number }[];
  loo: { event_id: string; model: "M0"|"M1"|"M2"; coef: LnModel["coef"]; sigma: number }[];
}
// μ(x) = intercept + (night?coef.night:0) + (group==="G2"?coef.G2:0) + (group==="G3"?coef.G3:0)  — 모형에 없는 계수는 0

// ───────────────────────── §6-6 엔진 (B 소유, C·화면이 사용) ─────────────────────────
export type DeviceId = "VENT_A"|"VENT_B"|"O2_STAT"|"O2_PORT"|"SUCTION"|"COUGH";
export interface DeviceSpec { id: DeviceId; label: string; ref_label: string; aliases: string[];
  h_worst_min: number; h_std_min: number|null; p_rated_w: number; p_peak_w: number|null;
  inputs: ("AC"|"DC12_24")[]; family: string; alarm_critical_min: number; heat_stop_c: number|null;
  source: "manual"|"manual_unpaged"|"assumed"; refs: { url: string; page?: number; quote: string }[]; note?: string; }
export interface ExtBatterySpec { id: string; label: string; family: string; h_worst_min: number; source: "manual"|"assumed"; }
export type ResourceType = "PS_L"|"PS_S"|"ESS"|"RB"|"GEN";
export interface Resource { id: string; type: ResourceType; label: string; base_label: string;
  x_km: number; y_km: number; available: boolean; soc: number;
  output: "AC_SINE"|"AC_UNKNOWN"|"FAMILY"; family?: string; cont_w: number|null; energy_wh: number|null; rb_minutes?: number; }
export interface HouseholdObserved {
  device_id: DeviceId|null;                       // null = 기기 모름
  device_match: "manual"|"assumed"|"unknown";      // 등록 대조 결과
  age_years: number|null;
  screen: { kind: "minutes"|"percent"; value: number; at: ISO } | null;   // B
  self: { charge: number; at: ISO } | null;                              // C, 0~1
  ext: { spec_id: string|null; verified: boolean; charge: "full"|"half"|"unknown"; nominal_min: number|null } | null;
  spare_o2_min: number|null;                                             // C
}
export interface HouseholdTruth { device_id: DeviceId; battery_min: number; ext_usable_min: number; spare_o2_min: number; }
export interface Household { id: string; alias: string; x_km: number; y_km: number; area: string;
  observed: HouseholdObserved; truth?: HouseholdTruth;              // truth는 평가 세트에만
  persona?: { guardian: string; patient: string; note: string }; }
export interface SafeTime { status: "value"|"zero_confirmed"|"unknown"; s_low_min: number|null; s_low_engine_min: number;
  grade: "A"|"B"|"C"|null; reference_std_min: number|null; ext_excluded_min: number|null;
  flags: ("conflict"|"ext_excluded"|"heat"|"assumed_spec"|"age_unknown")[]; }
export type RestoreDist =
  | { kind: "lognormal"; mu: number; sigma: number; elapsed_min: number; small_cell: boolean }
  | { kind: "fixed"; remaining_min: number }      // A1
  | { kind: "oracle"; remaining_min: number };    // ORACLE
export type ExclusionReason = "unavailable"|"low_soc"|"waveform_unknown"|"connector"|"input_mismatch"|"power_short";
export interface EngineParams { self_discount: number; age_per_year: number; age_floor: number; age_unknown_factor: number;
  alarm_margin_min: number; prep_min: number; road_factor: number; speed_urban_kmh: number; speed_rural_kmh: number;
  rain_factor: number; wind_factor: number; wind_threshold_ms: number; conv_eff: number; soc_min: number;
  peak_margin: number; o2_peak_mult: number; lane119_pmin: number; small_cell_n: number; q_main: number; q_small: number; }
export const DEFAULT_PARAMS: EngineParams = { self_discount: 0.15, age_per_year: 0.1, age_floor: 0.6, age_unknown_factor: 0.6,
  alarm_margin_min: 10, prep_min: 10, road_factor: 1.3, speed_urban_kmh: 25, speed_rural_kmh: 40,
  rain_factor: 1.2, wind_factor: 1.3, wind_threshold_ms: 14, conv_eff: 0.85, soc_min: 0.2,
  peak_margin: 1.25, o2_peak_mult: 2.0, lane119_pmin: 0.10, small_cell_n: 5, q_main: 0.8, q_small: 0.9 };
export interface AllocInput { households: Household[]; resources: Resource[]; specs: { devices: DeviceSpec[]; ext: ExtBatterySpec[] };
  now: ISO; urban: boolean; restore: RestoreDist; weather: { precip_mm: number; wind_ms: number; temp_c: number } | null;
  fixed: { hid: string; rid: string; approved_at: ISO }[]; params: EngineParams; }
export type Method = "ours"|"R1"|"R2"|"R3"|"A1"|"ORACLE"|"LLM_HAIKU"|"LLM_SONNET";
export interface PlanRow { hid: string; safe: SafeTime; rid: string|null; arrival_min: number|null; supply_min: number|null;
  p_int: number; ei_min: number; p_int0: number; ei0_min: number;
  rq_min: number; a_min_min: number|null; margin_min: number; priority: number;
  lane: "119"|"manual"|"main"; lane_reason?: "no_compatible"|"late_arrival"|"unknown"|"conflict";
  excluded: { rid: string; reason: ExclusionReason; need_w?: number }[]; fixed: boolean; }
export interface Plan { method: Method; rows: PlanRow[]; expected_interrupted: number; total_ei_min: number; solve_ms: number; violations: number; }
export interface ScoreRow { interrupted: number; interruption_min: number; violations: number; energy_short: number; unknown_share: number; }

// ───────────────────────── §6-7 합성 생성기 (lib/synth/generate.ts, B 소유) ─────────────────────────
export interface SynthConfig { seed: number; mode: "scenario"|"eval"; n_households: number; urban: boolean;
  area_km: number; areas: string[]; resources: Partial<Record<ResourceType, number>>;
  quotas?: { unknown: number; conflict: number; o2_stat: number };   // 시나리오만
  fixed_households?: Household[];                                    // sc1 H01 같은 각본 가구
  obs_at: ISO; }
// export function generate(cfg: SynthConfig, specs): { households: Household[]; resources: Resource[] };  — lib/synth/generate.ts
// 평가 모드: truth 채움. 시나리오 모드: truth 없음(observed만)

// ───────────────────────── §6-8 브라우저 상태 (lib/state/store.ts, B 소유) ─────────────────────────
export interface ScenarioState { v: 1; scenario_id: string; now: ISO;
  approvals: { hid: string; rid: string; approved_at: ISO; reason?: "기본"|"다른 호환 자원"|"거리"|"기타" }[];
  holds: string[];  card119_approved: string[];
  overrides: Record<string, Partial<HouseholdObserved>>;   // /home 입력·운영자 전화 확인
  reports: { hid: string; at: ISO }[];
  seen_sms: number[]; updated_at: ISO; }
// key `sumsigye:v1:<scenario_id>` · localStorage(try/catch, 실패 시 모듈 메모리 Map) · 저장 때 BroadcastChannel("sumsigye").postMessage({scenario_id, updated_at})
// load(id) / save(id, s) / subscribe(id, cb) → unsubscribe / reset(id) / resetAll()

// ───────────────────────── §6-9 시나리오 묶음 (data/scenarios/sc*.json, C 소유) ─────────────────────────
export interface ScenarioBundle {
  id: "sc1"|"sc2"|"sc3"; title: string; card_line: string; region: { sido: string; sigungu: string; areas: string[]; urban: boolean; area_km: number };
  outage_start: ISO; event_id: string;
  actual: { kind: "exact"; restored_at: ISO } | { kind: "interval"; lower_at: ISO; upper_at: ISO };
  restore_model: { source: "loo"|"full"|"provisional"; model: "M0"|"M1"|"M2"; coef: LnModel["coef"]; sigma: number; cells_small: Record<string, boolean> };
  weather: { attribution: string; note: string; hourly: { at: ISO; temp_c: number; precip_mm: number; wind_ms: number }[] } | null;
  households: Household[]; resources: Resource[]; seed: number;
  timeline: ({ at: ISO; type: "report"; hid: string; screen?: HouseholdObserved["screen"] }
           | { at: ISO; type: "sms"; sn: number; text: string; org: string }
           | { at: ISO; type: "restored"; label: string })[];
  decision_points: ISO[];
  precomputed: { l1: Record<string, { model: "claude-haiku-5-5"; fields: L1Resolved }>;
                 briefs: Record<string, { lines: string[]; model: string; fallback: boolean }>;   // key = state hash
                 guides: Record<string, { lines: string[]; model: string; fallback: boolean }> };
  showcase: { hid: string|null; source: "scenario"|"eval"; eval_seed?: number };
  built_at: ISO; provisional: boolean; }
// 상태 해시 = sha256(JSON.stringify({scenario, decision_index, approvals, overrides})) 앞 16자(정렬된 키).

// ───────────────────────── §6-10 평가 결과 파일 (화면이 읽는 형태) ─────────────────────────
export type EvalStatus = "measuring"|"final";
export interface WilsonCov { a: number; n: number; lo: number; hi: number; }

// l1_results.json
export interface L1Results {
  status: EvalStatus;
  meta: { reviewed_n: number; total_n: number; labeler: "applicant"|"none"; method: string; realtime_mode: "llm"|"merged";
          // 선택 칸(A의 eval-l1.ts가 더함 — 2026-10-25 C가 타입에 반영)
          reference?: "gold"|"none"; min_reviewed?: number; label_line?: string; link_reviewed_n?: number; built_at?: ISO };
  rows: { system: "rule"|"claude-haiku-5-5"|"claude-sonnet-5"; relevant_f1: number|null; kind_acc: number|null;
          time_exact: { rate: number|null; n: number }; null_correct: { rate: number|null; n: number };
          eta_base_acc: number|null; cause6_acc: number|null; cause3_acc: number|null; link_p: number|null; link_r: number|null }[];
  auto_checks: { system: string; evidence_in_text: number; time_format_ok: number; n?: number; evidence_n?: number; time_n?: number }[];
  /** 검수 전(g < min_reviewed): 개발용 문자에서 동결 규칙 r1 대비 일치율 */
  vs_rule?: { label: string; set: string; reference: string;
    rows: { system: string; n: number; relevant_agree_f1: number|null; kind_agree: number|null; time_agree: { rate: number|null; n: number };
            null_agree: { rate: number|null; n: number }; eta_base_agree: number|null; cause6_agree: number|null; cause3_agree: number|null }[] };
}

// l2_results.json
export interface L2Results {
  status: EvalStatus; reviewed: boolean; review: { n_before: number; n_after: number; excluded: number };
  data: RestoreModelFile["data"]; selected: string; lr_tests: RestoreModelFile["lr_tests"];
  loo: { id: "M0"|"M1"|"M2"|"B0"|"B1"|"B2"; label: string; n: number;
         pinball: { t50: number; t80: number; t90: number; mean: number }; p80_mean_h: number|null;
         cov80: WilsonCov|null; cov90: WilsonCov|null;
         alt?: { label: string; n: number; pinball: { t50: number; t80: number; t90: number; mean: number }; p80_mean_h: number|null; cov80: WilsonCov|null; cov90: WilsonCov|null } }[];
  interval_coverage: { hit: number; miss: number; undetermined: number };
  time_split: { train_n: number; test_n: number; rows: { id: string; pinball_mean: number; cov80: WilsonCov|null }[]; split_at?: ISO };
  events_plot: { event_id: string; outcome: string; t_h?: number; lower_h?: number; upper_h?: number; org: string; date: string }[];
  curve: { t_h: number; s: number }[];       // 선택 모형 전체 칸(경과 0) 0~12시간 0.1 간격
}

// l4_results.json
export interface Agg { interrupted_mean: number; ci: [number, number]; ei_mean: number; violations_mean: number; energy_short_mean: number; unknown_share: number; }
export interface L4Results {
  status: EvalStatus; provisional: boolean; meta: { n_small: 200; n_wide: 200; truth_pool: "loo_pair"; boot: 2000 };
  methods: { id: Method; label: string; small: Agg; wide: Agg; all: Agg }[];
  diffs: { a: Method; b: Method; scope: "small"|"wide"|"all"; mean: number; ci: [number, number] }[];
  llm: { subset_seeds: number[]; rows: { id: Method|"ours"|"R1"; n: number; parse_fail: number; interrupted_mean: number; ci: [number,number]; violations_total: number }[] } | null;
  compute_ms_wide: number;
}

// l4_sensitivity.json
export interface L4Sensitivity { status: EvalStatus; rows: { key: string; label: string; ours: number; r1: number; diff: number; ci: [number, number] }[]; }
// 화면 규칙: status !== "final" 또는 provisional === true면 숫자 옆에 「측정 중(임시)」, 띠·영상용 큰 숫자는 「측정 중」.
