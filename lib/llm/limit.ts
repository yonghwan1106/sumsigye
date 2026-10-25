// 호출 상한 (구현명세 §7-6): IP 분당 6(60초 슬라이딩 창), 인스턴스 일일 300(서울 시간 자정 초기화).
// 인메모리라 인스턴스마다 따로 센다 — 진짜 상한은 Anthropic 콘솔 지출 한도.
// LLM을 실제로 부르기 직전에만 tryAcquire를 부른다(사전계산·캐시 적중은 세지 않는다).

export type LimitReason = "rate_limited" | "daily_cap";

export interface Limiter {
  tryAcquire(ip: string): { ok: true } | { ok: false; reason: LimitReason };
  dailyUsed(): number;
  config(): { rpm: number; dailyCap: number };
}

const KST_OFFSET_MS = 9 * 3600 * 1000;

/** 서울 날짜 열쇠("2026-10-26"). */
export function seoulDayKey(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function createLimiter(opts: { rpm: number; dailyCap: number; now?: () => number; maxIps?: number }): Limiter {
  const now = opts.now ?? Date.now;
  const rpm = Math.max(1, opts.rpm);
  const cap = Math.max(1, opts.dailyCap);
  const maxIps = opts.maxIps ?? 5000;
  const WINDOW_MS = 60000;
  // IP마다 최근 60초 호출 시각(슬라이딩 창). 「같은 IP 1분 안 7번째 거부」를 정확히 지킨다(연속 보충 토큰버킷은 1분 안 7번째를 통과시킬 수 있다).
  const hits = new Map<string, number[]>();
  let day = seoulDayKey(now());
  let used = 0;

  function rollDay(t: number) {
    const k = seoulDayKey(t);
    if (k !== day) {
      day = k;
      used = 0;
    }
  }

  return {
    tryAcquire(ip: string) {
      const t = now();
      rollDay(t);
      const key = ip || "unknown";
      let arr = hits.get(key);
      if (!arr) {
        if (hits.size >= maxIps) {
          const oldest = hits.keys().next().value;
          if (oldest !== undefined) hits.delete(oldest);
        }
        arr = [];
        hits.set(key, arr);
      }
      while (arr.length > 0 && t - arr[0] >= WINDOW_MS) arr.shift();
      if (arr.length >= rpm) return { ok: false, reason: "rate_limited" };
      if (used >= cap) return { ok: false, reason: "daily_cap" };
      arr.push(t);
      used += 1;
      return { ok: true };
    },
    dailyUsed() {
      rollDay(now());
      return used;
    },
    config() {
      return { rpm, dailyCap: cap };
    },
  };
}

function intEnv(name: string, dflt: number): number {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : dflt;
}

export const INPUT_MAX_CHARS = 1000;

let shared: Limiter | null = null;
/** 서버 공용 상한(환경변수 AI_RPM_PER_IP·AI_DAILY_CAP, 기본 6·300). */
export function sharedLimiter(): Limiter {
  if (!shared) shared = createLimiter({ rpm: intEnv("AI_RPM_PER_IP", 6), dailyCap: intEnv("AI_DAILY_CAP", 300) });
  return shared;
}

/** IP = x-forwarded-for 첫 값. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}
