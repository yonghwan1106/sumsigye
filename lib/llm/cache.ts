// 캐시 (구현명세 §7-2·§7-6): 사전계산(data/precomputed/api_cache.json, 서버 전용) → 인메모리 LRU(500) → 호출.
import { createHash } from "node:crypto";
import apiCacheJson from "@/data/precomputed/api_cache.json";
import type { L1Raw, L1Resolved } from "@/lib/types";
import { normalizeText } from "@/lib/l1/llmExtract";
import { stableStringify } from "@/lib/llm/stateHash";

export class Lru<V> {
  private map = new Map<string, V>();
  constructor(private max = 500) {}
  get(k: string): V | undefined {
    const v = this.map.get(k);
    if (v === undefined) return undefined;
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  set(k: string, v: V): void {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
  get size(): number {
    return this.map.size;
  }
}

export const LRU_MAX = 500;

export interface ApiCacheFile {
  meta: { built_at: string; n_extract: number; n_brief: number; n_guide: number; note?: string };
  /** key = apiCacheKey(정규화 문안, sent_at) */
  extract: Record<string, { sn: number; sent_at: string; model: string; raw: L1Raw; fields: L1Resolved }>;
  /** sha256(정규화 문안) → extract key (발송 시각이 다른 같은 문안을 찾을 때) */
  text_index: Record<string, string>;
  /** key = 상태 해시(시나리오 기본 상태 메모) */
  briefs: Record<string, { lines: string[]; model: string; fallback: boolean }>;
  /** key = guideKey(요청) */
  guides: Record<string, { lines: string[]; model: string; fallback: boolean }>;
}

export const API_CACHE = apiCacheJson as unknown as ApiCacheFile;

export function textKey(text: string): string {
  return createHash("sha256").update(normalizeText(text)).digest("hex");
}

export function shortHash(v: unknown): string {
  return createHash("sha256").update(stableStringify(v)).digest("hex").slice(0, 16);
}
