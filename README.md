# 숨시계 | 정전 골든타임 AI

숨시계 | 정전 골든타임 AI — 2026 AI 라이프 솔루션 챌린지 아이디어 후보작 「12번. 전력안심망 AI」(제안자 아이디어)를 이번 대회를 위해 새로 구현한 시제품입니다. 가구·기기 상태·비상전원은 합성 데이터이고, 재난문자는 행정안전부 재난안전데이터공유플랫폼 실제 공공 데이터, 기상은 Open-Meteo 재분석 자료(CC BY 4.0)입니다. 전력 사용 패턴(AMI) 분석은 쓰지 않습니다.

- 배포: https://sumsigye.vercel.app
- 상태: 골격 단계(C1). 평가 수치는 `data/eval/*.json`에서만 읽으며, 확정 전에는 「측정 중」으로 표시합니다.

## 실행

```bash
npm install
npm run dev -- -p 3102
npm run build
```

- AI 키는 **환경변수로만** 넣습니다(`ANTHROPIC_API_KEY`). `.env.local` 등 파일에 쓰지 않습니다. 키가 없으면 데모 모드(규칙·사전계산)로 동작합니다.
- Vercel 운영 배포는 `vercel --prod -e ANTHROPIC_API_KEY=…` 방식으로 키를 넣습니다. **`-e` 값은 그 배포에만 붙으므로 재배포할 때마다 다시 넣어야 합니다.** Git 자동배포는 쓰지 않습니다.

## 폴더

`app/`(화면·API) · `lib/`(타입·문구·엔진·L1) · `data/`(커밋하는 산출물) · `pipeline/`(Python 수집·적합) · `scripts/`(TS 데이터·평가 스크립트) · `prompts/`(LLM 프롬프트 공개 사본) · `tests/`
