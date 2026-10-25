// LLM 호출 계층 (구현명세 §2·§7-6) — never-throw.
// - 키는 process.env.ANTHROPIC_API_KEY에서만 읽는다. 값·길이·앞자리를 응답·로그에 넣지 않는다.
// - temperature는 어떤 호출에도 넣지 않는다(sonnet-5는 400).
// - thinking은 끈다(haiku-5-5는 기본으로 생각 토큰을 써서 max_tokens 300 안에서 글이 잘린다 — 2026-10-25 실측).
// - 요청 옵션 { timeout: 12000, maxRetries: 0 }. 모델 폴백은 withFallback이 1회만.
// - 요청·응답 본문을 로그에 남기지 않는다.
import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_REALTIME_MODEL = "claude-haiku-5-5";
export const DEFAULT_FALLBACK_MODEL = "claude-haiku-4-5";
export const OFFLINE_MODEL = "claude-sonnet-5";
export const CALL_TIMEOUT_MS = 12000;

export function realtimeModel(): string {
  return (process.env.ANTHROPIC_MODEL ?? "").trim() || DEFAULT_REALTIME_MODEL;
}
export function fallbackModel(): string {
  return (process.env.ANTHROPIC_FALLBACK_MODEL ?? "").trim() || DEFAULT_FALLBACK_MODEL;
}

export function apiKeyPresent(): boolean {
  return (process.env.ANTHROPIC_API_KEY ?? "").trim().length > 0;
}

let cached: { client: Anthropic; fingerprint: number } | null = null;

// 키가 바뀌면(시험에서 env를 바꿀 때) 새 클라이언트를 만든다. 지문은 길이·문자 합이 아닌 단순 해시 — 밖으로 내보내지 않는다.
function fingerprintOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function getClient(): Anthropic | null {
  const key = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!key) return null;
  const fp = fingerprintOf(key);
  if (cached && cached.fingerprint === fp) return cached.client;
  cached = { client: new Anthropic({ apiKey: key, maxRetries: 0, timeout: CALL_TIMEOUT_MS }), fingerprint: fp };
  return cached.client;
}

export type LlmFailure = "no_key" | "llm_error" | "invalid_output";

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type ToolCallResult =
  | { ok: true; model: string; input: unknown; latency_ms: number }
  | { ok: false; model: string; error: LlmFailure; latency_ms: number };

export type TextCallResult =
  | { ok: true; model: string; text: string; latency_ms: number }
  | { ok: false; model: string; error: LlmFailure; latency_ms: number };

/** 도구 호출 1회(tool_choice 고정). 예외를 던지지 않는다. */
export async function callTool(opts: {
  model: string;
  system: string;
  user: string;
  tool: ToolDef;
  maxTokens: number;
  timeoutMs?: number;
}): Promise<ToolCallResult> {
  const t0 = Date.now();
  const client = getClient();
  if (!client) return { ok: false, model: opts.model, error: "no_key", latency_ms: 0 };
  try {
    const msg = await client.messages.create(
      {
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
        thinking: { type: "disabled" },
        tools: [
          {
            name: opts.tool.name,
            description: opts.tool.description,
            input_schema: opts.tool.input_schema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: opts.tool.name },
      },
      { timeout: opts.timeoutMs ?? CALL_TIMEOUT_MS, maxRetries: 0 },
    );
    const block = msg.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      return { ok: false, model: opts.model, error: "invalid_output", latency_ms: Date.now() - t0 };
    }
    return { ok: true, model: opts.model, input: block.input, latency_ms: Date.now() - t0 };
  } catch {
    return { ok: false, model: opts.model, error: "llm_error", latency_ms: Date.now() - t0 };
  }
}

/** 글 응답 1회. 예외를 던지지 않는다. */
export async function callText(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs?: number;
}): Promise<TextCallResult> {
  const t0 = Date.now();
  const client = getClient();
  if (!client) return { ok: false, model: opts.model, error: "no_key", latency_ms: 0 };
  try {
    const msg = await client.messages.create(
      {
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
        thinking: { type: "disabled" },
      },
      { timeout: opts.timeoutMs ?? CALL_TIMEOUT_MS, maxRetries: 0 },
    );
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    // max_tokens에서 끊긴 글은 문장이 잘려 있으므로 쓰지 않는다.
    if (!text || msg.stop_reason === "max_tokens") return { ok: false, model: opts.model, error: "invalid_output", latency_ms: Date.now() - t0 };
    return { ok: true, model: opts.model, text, latency_ms: Date.now() - t0 };
  } catch {
    return { ok: false, model: opts.model, error: "llm_error", latency_ms: Date.now() - t0 };
  }
}

/**
 * 주 모델 → 실패 시 폴백 모델 1회. `no_key`면 폴백하지 않는다.
 * run이 ok:false를 돌려주면(호출 실패·출력 검사 실패 모두) 다음 모델로 넘어간다.
 */
export async function withFallback<T extends { ok: boolean; error?: string }>(
  models: string[],
  run: (model: string) => Promise<T>,
): Promise<T> {
  let last: T | null = null;
  for (const m of models.slice(0, 2)) {
    const r = await run(m);
    if (r.ok) return r;
    last = r;
    if (r.error === "no_key") break;
  }
  return last as T;
}
