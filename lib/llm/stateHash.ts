// 상태 해시 (구현명세 §6-9 끝): sha256(JSON.stringify({scenario, decision_index, approvals, overrides}), 정렬된 키) 앞 16자.
// 브라우저(B의 /ops)와 Node(C3 build-scenarios) 양쪽에서 쓴다 — Web Crypto(globalThis.crypto.subtle)만 쓴다.
import type { HouseholdObserved, ScenarioState } from "@/lib/types";

/** 정렬된 키로 JSON 문자열. undefined 칸은 뺀다. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export interface StateHashInput {
  scenario: string;
  decision_index: number;
  approvals: ScenarioState["approvals"];
  overrides: Record<string, Partial<HouseholdObserved>>;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 시나리오 기본 상태 = approvals [] · overrides {}. */
export async function stateHash(x: StateHashInput): Promise<string> {
  return (await sha256Hex(stableStringify(x))).slice(0, 16);
}
