// 브라우저 상태(구현명세 §6-8): localStorage(try/catch, 실패 시 모듈 메모리 Map) + BroadcastChannel("sumsigye").
// 서버로 보내지 않는다. 개인정보 입력칸이 없다(가명 ID만).
import type { ISO, ScenarioState } from "../types";

const PREFIX = "sumsigye:v1:";
const CHANNEL = "sumsigye";
const mem = new Map<string, string>();
type Listener = (s: ScenarioState | null) => void;
const local = new Map<string, Set<Listener>>(); // 같은 탭 안 구독자

export const keyOf = (id: string) => `${PREFIX}${id}`;

function nowIso(): ISO {
  const d = new Date(Date.now() + 9 * 3600000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+09:00`;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch { return null; }
}
function readRaw(k: string): string | null {
  const ls = storage();
  if (ls) { try { return ls.getItem(k); } catch { /* 저장소 접근 실패 → 메모리로 */ } }
  return mem.get(k) ?? null;
}
function writeRaw(k: string, v: string | null) {
  if (v == null) mem.delete(k); else mem.set(k, v);
  const ls = storage();
  if (!ls) return;
  try { if (v == null) ls.removeItem(k); else ls.setItem(k, v); } catch { /* 메모리만 */ }
}

let bc: BroadcastChannel | null | undefined;
function channel(): BroadcastChannel | null {
  if (bc !== undefined) return bc;
  try { bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null; } catch { bc = null; }
  return bc;
}

function notifyLocal(id: string) {
  const s = load(id);
  local.get(id)?.forEach((cb) => cb(s));
  if (id === "*") local.forEach((set, k) => set.forEach((cb) => cb(load(k))));
}

export function emptyState(id: string, now: ISO): ScenarioState {
  return { v: 1, scenario_id: id, now, approvals: [], holds: [], card119_approved: [], overrides: {}, reports: [], seen_sms: [], updated_at: nowIso() };
}

export function load(id: string): ScenarioState | null {
  const raw = readRaw(keyOf(id));
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as ScenarioState;
    return s && s.v === 1 && s.scenario_id === id ? s : null;
  } catch { return null; }
}

export function save(id: string, s: ScenarioState): ScenarioState {
  const next: ScenarioState = { ...s, scenario_id: id, updated_at: nowIso() };
  writeRaw(keyOf(id), JSON.stringify(next));
  try { channel()?.postMessage({ scenario_id: id, updated_at: next.updated_at }); } catch { /* 무시 */ }
  notifyLocal(id);
  return next;
}

/** 같은 탭(save 호출)·다른 탭(BroadcastChannel·storage 이벤트)의 변경을 받는다. */
export function subscribe(id: string, cb: Listener): () => void {
  let set = local.get(id);
  if (!set) { set = new Set(); local.set(id, set); }
  set.add(cb);
  const ch = channel();
  const onMsg = (e: MessageEvent) => {
    const d = e.data as { scenario_id?: string } | null;
    if (d && (d.scenario_id === id || d.scenario_id === "*")) cb(load(id));
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === keyOf(id)) cb(load(id));
  };
  ch?.addEventListener("message", onMsg);
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    set!.delete(cb);
    ch?.removeEventListener("message", onMsg);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function reset(id: string) {
  writeRaw(keyOf(id), null);
  try { channel()?.postMessage({ scenario_id: id, updated_at: nowIso() }); } catch { /* 무시 */ }
  notifyLocal(id);
}

export function resetAll() {
  const keys = new Set<string>([...mem.keys()].filter((k) => k.startsWith(PREFIX)));
  const ls = storage();
  if (ls) {
    try { for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(PREFIX)) keys.add(k); } } catch { /* 무시 */ }
  }
  keys.forEach((k) => writeRaw(k, null));
  try { channel()?.postMessage({ scenario_id: "*", updated_at: nowIso() }); } catch { /* 무시 */ }
  local.forEach((set, k) => set.forEach((cb) => cb(load(k))));
}
