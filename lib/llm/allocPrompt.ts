// AI 챗봇 단독 배정 기준선 프롬프트 (구현명세 §5-5·§7-5) — scripts/eval-llm-baseline.ts가 쓴다(오프라인 전용).
// 공개 사본: prompts/llm_alloc_baseline.md (tests/api.test.ts가 대조).

export const ALLOC_MAX_TOKENS = 2000;

export const ALLOC_SYSTEM_PROMPT = `너는 지자체 재난 담당자의 비상전원 배정을 돕는다. 목표: 기기가 멈추는 가구 수를 가장 적게, 같으면 멈추는 시간 합을 가장 짧게. 제약: (1) 의료기기에는 정현파 AC 또는 같은 계열 전용 배터리만 (2) 출력 파형이 확인 안 된 발전기는 쓰지 않는다 (3) 연속 출력 ≥ 기기 피크 전력(피크 미상이면 정격 × 1.25, 기기 모름이면 640W) (4) 사용 불가·잔량 20% 이하 자원 금지 (5) 자원 1대 = 가구 1곳. 출력은 JSON만: [{"household":"H01","resource":"R03"|null}]`;

/** 사용자 메시지(표 4개 + 기기 사양표). 숨시계 엔진이 보는 것과 같은 관측값만 넣는다(참값 없음). */
export interface AllocPromptInput {
  households: { id: string; device: string; s_low: string; grade: string }[];
  devices: { label: string; rated_w: number; peak_w: string; inputs: string; family: string }[];
  resources: { id: string; type: string; output: string; cont_w: string; energy_wh: string; soc: string; available: string }[];
  arrival: { hid: string; mins: (number | null)[] }[];
  resource_ids: string[];
  restore: { p50: number; p80: number; p90: number };
}

const lines = (rows: (string | number)[][]) => rows.map((r) => r.join(" | ")).join("\n");

export function allocUserMessage(x: AllocPromptInput): string {
  return [
    "[가구] ID | 기기 | 잔여안전시간 하한(분, 모름이면 '모름') | 정보 등급",
    lines(x.households.map((h) => [h.id, h.device, h.s_low, h.grade])),
    "",
    "[기기 사양] 기기 | 정격 W | 피크 W | 입력 형식 | 계열",
    lines(x.devices.map((d) => [d.label, d.rated_w, d.peak_w, d.inputs, d.family])),
    "",
    "[자원] ID | 유형 | 출력 형식 | 연속 출력 W | 에너지 Wh | 잔량 | 가용",
    lines(x.resources.map((r) => [r.id, r.type, r.output, r.cont_w, r.energy_wh, r.soc, r.available])),
    "",
    `[도착시간(분)] 가구 / 자원 | ${x.resource_ids.join(" | ")}`,
    lines(x.arrival.map((a) => [a.hid, ...a.mins.map((m) => (m == null ? "-" : String(Math.round(m))))])),
    "",
    `[남은 복구시간(분)] P50 ${Math.round(x.restore.p50)} · P80 ${Math.round(x.restore.p80)} · P90 ${Math.round(x.restore.p90)}`,
    "",
    "모든 가구를 한 번씩 넣은 JSON 배열만 출력하라.",
  ].join("\n");
}

/** 응답 글 → 배정 배열. 형식이 틀리면 null. */
export function parseAllocResponse(text: string): { household: string; resource: string | null }[] | null {
  const a = text.indexOf("[");
  const b = text.lastIndexOf("]");
  if (a < 0 || b <= a) return null;
  let v: unknown;
  try {
    v = JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(v)) return null;
  const out: { household: string; resource: string | null }[] = [];
  for (const it of v) {
    if (!it || typeof it !== "object") return null;
    const o = it as Record<string, unknown>;
    if (typeof o.household !== "string") return null;
    if (!(o.resource === null || typeof o.resource === "string")) return null;
    out.push({ household: o.household, resource: (o.resource as string | null) || null });
  }
  return out;
}
