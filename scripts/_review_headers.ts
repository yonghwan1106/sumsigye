// 검수 시트 머리(구현명세 §4-4). make-review-sheets(쓰기)·ingest-review(읽기)가 같이 쓴다.
export const GOLD_HEADER = ["order", "sn", "sent_at", "org", "text", "relevant(Y/N)", "kind", "occurred_clock", "eta_type(absolute/duration/none)", "eta_clock", "eta_minutes", "eta_base(occurrence/sent/unknown)", "restored_clock", "cause6", "areas(쉼표)", "검수(확인/수정)", "메모"];
export const LINK_HEADER = ["pair_id", "sn_a", "sent_a", "text_a", "sn_b", "sent_b", "text_b", "같은사건(예/아니오)", "메모"];
export const EVENTS_HEADER = ["event_id", "org", "outcome(exact/interval/right)", "start_at", "restored_at", "lower_h", "upper_h", "duration_h", "flags", "문자들(sn|발송|문안을 ⏎로 이음)", "판정(맞음/수정/제외)", "수정_발생(YYYY-MM-DD HH:MM)", "수정_복구(YYYY-MM-DD HH:MM)", "수정_유형", "메모"];
