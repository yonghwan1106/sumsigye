# 데이터 파이프라인 (묶음 A)

명령은 모두 저장소 루트에서 `npm run …` (또는 `npm --prefix <저장소> run …`). Python은 numpy 2.2.6 · scipy 1.16.3(`requirements.txt`)이 필요하고, 사용자 site-packages에 설치돼 있으면 `python -I`로 돌리지 않는다.

| 단계 | 명령 | 산출 |
|---|---|---|
| P1 수집 | `npm run data:fetch` | `data/sms/corpus.json` · `fetch_log.json` (실종·배회 문자는 저장하지 않고 건수만) |
| P2 분리 | `npm run data:split` | 골드 60행(층 20·15·10·15, 시드 20261026) · `data/sms/split.json` |
| P3 규칙 | `npm test -- l1` → `npm run data:rule` | `data/l1/extract_rule.json` (규칙 r1 동결) |
| P4 검수 시트 | `npm run data:review-sheets -- --stage gold` | `data/review/gold_review.csv` · `link_review.csv` · `README_검수안내.md` |
| P5 LLM(개발용) | `node scripts/with-key.mjs --key-file <키 파일> -- npm run data:llm -- --model claude-sonnet-5 --split dev` | `data/l1/extract_sonnet.json` (골드 sn 0건 검사) |
| P6 사건표 | `npm run data:events` → `npm run data:review-sheets -- --stage events` | `data/events/events.json` · `data/review/events_review.csv` |
| P10 L2 | `npm run data:fit` (자체 시험 `python pipeline/fit_restore.py --selftest`) | `data/model/restore_model.json` · `data/eval/l2_results.json` · `data/model/_fixture_survival.json` |
| P11 기상 | `npm run data:weather` | `data/weather/sc1·sc2·sc3.json` (Open-Meteo 재분석, CC BY 4.0) |

## 응모자 검수 CSV가 왔을 때
1. 고친 CSV 3개를 `data/review/`에 같은 이름으로 둔다(시트 생성 스크립트는 검수 칸이 채워진 시트를 덮어쓰지 않는다).
2. `npm run data:ingest-review` → 커밋 `E1-A9: gold labels reviewed by applicant (g=NN)` (골드 LLM 추출보다 앞).
3. (선택, 키 필요) `data:llm -- --model claude-haiku-5-5 --split gold,fixtures` · `data:llm -- --model claude-sonnet-5 --split gold` → 커밋 `E1-A9b`. 이 단계를 건너뛰면 LLM 두 줄의 정확도는 null(측정 안 함)로 남는다.
4. `npm run rebuild:data` — 사건표 재구성(검수 반영) → 재적합 → L1 평가 → 시나리오 → 배정 평가. 화면 문구는 `l1_results.json`의 `meta.reviewed_n`에 따라 「정답 라벨 검수 전 — 규칙 추출기 대비 일치율」에서 「응모자 검수 g건」으로 바뀐다(정확도 표는 g ≥ 40일 때).
