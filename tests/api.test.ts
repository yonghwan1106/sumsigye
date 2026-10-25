// API 계층 시험 (구현명세 §12-3 C): 상한·캐시·검사·라우트(키 없이)·프롬프트 공개 사본 대조.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createLimiter, seoulDayKey } from "@/lib/llm/limit";
import { Lru } from "@/lib/llm/cache";
import { briefOk, guideOk, numberTokens, parseLines } from "@/lib/llm/guard";
import { L1_SYSTEM_PROMPT } from "@/lib/l1/llmExtract";
import { BRIEF_SYSTEM_PROMPT, briefTemplate, type BriefFacts } from "@/lib/llm/brief";
import { GUIDE_SYSTEM_PROMPT, guideChecklist, guideKeywords } from "@/lib/llm/guide";
import { stateHash, stableStringify } from "@/lib/llm/stateHash";
import { ALLOC_SYSTEM_PROMPT } from "@/lib/llm/allocPrompt";

const ROOT = path.resolve(__dirname, "..");

function promptBlock(file: string): string {
  const md = readFileSync(path.join(ROOT, "prompts", file), "utf8").replace(/\r\n/g, "\n");
  const m = md.match(/```text\n([\s\S]*?)\n```/);
  if (!m) throw new Error(`no text block in ${file}`);
  return m[1];
}
const lf = (s: string) => s.replace(/\r\n/g, "\n");

describe("프롬프트 공개 사본 = 코드 문자열", () => {
  it("l1_extract.md", () => expect(promptBlock("l1_extract.md")).toBe(lf(L1_SYSTEM_PROMPT)));
  it("brief.md", () => expect(promptBlock("brief.md")).toBe(lf(BRIEF_SYSTEM_PROMPT)));
  it("guide.md", () => expect(promptBlock("guide.md")).toBe(lf(GUIDE_SYSTEM_PROMPT)));
  it("llm_alloc_baseline.md", () => expect(promptBlock("llm_alloc_baseline.md")).toBe(lf(ALLOC_SYSTEM_PROMPT)));
});

describe("lib/llm/limit.ts", () => {
  it("같은 IP 1분 안 7번째 거부, 다른 IP는 통과", () => {
    let t = Date.parse("2026-10-26T10:00:00+09:00");
    const lim = createLimiter({ rpm: 6, dailyCap: 300, now: () => t });
    for (let i = 0; i < 6; i++) {
      expect(lim.tryAcquire("1.1.1.1").ok).toBe(true);
      t += 5000;
    }
    expect(lim.tryAcquire("1.1.1.1")).toEqual({ ok: false, reason: "rate_limited" });
    expect(lim.tryAcquire("2.2.2.2").ok).toBe(true);
    t += 60000; // 첫 호출에서 1분 지나면 다시 된다
    expect(lim.tryAcquire("1.1.1.1").ok).toBe(true);
  });

  it("일일 301번째 거부", () => {
    let t = Date.parse("2026-10-26T09:00:00+09:00");
    const lim = createLimiter({ rpm: 6, dailyCap: 300, now: () => t });
    for (let i = 0; i < 300; i++) {
      expect(lim.tryAcquire(`10.0.${Math.floor(i / 6)}.${i % 6}`).ok).toBe(true);
      t += 100;
    }
    expect(lim.dailyUsed()).toBe(300);
    expect(lim.tryAcquire("9.9.9.9")).toEqual({ ok: false, reason: "daily_cap" });
  });

  it("서울 시간 자정에 일일 카운터 초기화 (UTC 15:00)", () => {
    let t = Date.parse("2026-10-26T23:59:00+09:00");
    const lim = createLimiter({ rpm: 6, dailyCap: 2, now: () => t });
    expect(lim.tryAcquire("a").ok).toBe(true);
    expect(lim.tryAcquire("b").ok).toBe(true);
    expect(lim.tryAcquire("c")).toEqual({ ok: false, reason: "daily_cap" });
    t = Date.parse("2026-10-27T00:00:01+09:00");
    expect(seoulDayKey(t)).toBe("2026-10-27");
    expect(lim.dailyUsed()).toBe(0);
    expect(lim.tryAcquire("c").ok).toBe(true);
  });
});

describe("LRU", () => {
  it("500 넘으면 가장 오래 안 쓴 것부터 버린다", () => {
    const l = new Lru<number>(3);
    l.set("a", 1);
    l.set("b", 2);
    l.set("c", 3);
    l.get("a");
    l.set("d", 4);
    expect(l.get("b")).toBeUndefined();
    expect(l.get("a")).toBe(1);
    expect(l.size).toBe(3);
  });
});

const FACTS: BriefFacts = {
  rows: [
    { alias: "H01", device: "인공호흡기 A계열", safe: "2시간 50분", prob: "30% 안팎", margin: "35분", resource: "휴대용 전원(대)", arrival: "22분", lane: "main", excluded: ["소방서 발전기: 의료기기에 써도 되는지 확인 안 됨 → 보내지 않음"] },
    { alias: "H03", device: "거치형 산소발생기", safe: "0분", prob: "95% 넘음", margin: "-1시간 10분", resource: null, arrival: null, lane: "119", excluded: [] },
    { alias: "H05", device: "모름", safe: "모름 — 전화로 확인", prob: "모름", margin: "모름", resource: null, arrival: null, lane: "manual", excluded: [] },
  ],
  changed: [],
  now: "18:58",
};

describe("lib/llm/guard.ts", () => {
  it("숫자 토막", () => {
    expect(numberTokens("H01은 2시간 50분, 30% 안팎")).toEqual(["01", "2시간", "50분", "30%"]);
  });
  it("brief: 표시 문자열에 없는 숫자 → 폐기", () => {
    const good = ["H01: 배터리 2시간 50분, 휴대용 전원(대)이 22분 뒤 도착합니다.", "H03: 0분이라 119 연계를 검토합니다.", "H05: 모름 — 전화로 확인이 먼저입니다."];
    expect(briefOk(good, FACTS)).toBe(true);
    const bad = [...good.slice(0, 2), "H05: 약 40분 남았습니다."];
    expect(briefOk(bad, FACTS)).toBe(false);
  });
  it("brief: 승인 권유 → 폐기", () => {
    const l = ["H01: 휴대용 전원(대)을 승인하세요.", "H03: 119 연계 검토.", "H05: 전화 확인."];
    expect(briefOk(l, FACTS)).toBe(false);
  });
  it("guide: 핵심 낱말 누락·처치 지시 → 폐기", () => {
    const c = guideChecklist("VENT_A");
    const k = guideKeywords("VENT_A");
    expect(guideOk(c, c, k, [])).toBe(true);
    const noSource = [c[0].replace("(인공호흡기 A계열 설명서 기준)", ""), ...c.slice(1)];
    expect(guideOk(noSource, c, k, [])).toBe(false); // ① 출처 구절 빠짐 → 폐기
    const missing = [...c];
    missing[1] = "다른 배터리를 연결하세요.";
    expect(guideOk(missing, c, k, [])).toBe(false);
    const med = [...c];
    med[3] = "휴대전화를 충전해 두고 기기 설정을 바꾸세요.";
    expect(guideOk(med, c, k, [])).toBe(false);
  });
  it("parseLines: 번호·기호 제거, 줄 수 검사", () => {
    expect(parseLines("1. 가\n- 나\n③ 다", 3)).toEqual(["가", "나", "다"]);
    expect(parseLines("가\n나", 3)).toBeNull();
  });
});

describe("상태 해시", () => {
  it("정렬된 키, 앞 16자, 키 순서 무관", async () => {
    const a = await stateHash({ scenario: "sc1", decision_index: 0, approvals: [], overrides: {} });
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
});

describe("라우트 (키 없이)", () => {
  beforeAll(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });
  const post = (body: unknown) =>
    new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.5, 10.0.0.1" }, body: JSON.stringify(body) });

  it("/api/health → mode demo, 키 정보 없음", async () => {
    const { GET } = await import("@/app/api/health/route");
    const j = await (await GET()).json();
    expect(j.mode).toBe("demo");
    expect(j.limits).toMatchObject({ rpm_per_ip: 6, daily_cap: 300, input_max_chars: 1000 });
    expect(JSON.stringify(j)).not.toMatch(/sk-ant/);
    expect(j.corpus.n).toBeGreaterThan(0);
  });

  it("/api/extract: 코퍼스 문자 266510 → precomputed(사전계산 있음) 또는 rule(no_key)", async () => {
    const { POST } = await import("@/app/api/extract/route");
    const { API_CACHE } = await import("@/lib/llm/cache");
    const { apiCacheKey } = await import("@/lib/l1/llmExtract");
    const corpus = JSON.parse(readFileSync(path.join(ROOT, "data/sms/corpus.json"), "utf8")) as { items: { sn: number; sent_at: string; org: string | null; text: string; fixture: boolean }[] };
    const row = corpus.items.find((r) => r.sn === 266510 && r.fixture)!;
    const res = await POST(post({ text: row.text, sent_at: row.sent_at, org: row.org }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    if (API_CACHE.extract[apiCacheKey(row.text, row.sent_at)]) {
      expect(j.source).toBe("precomputed");
      expect(j.fallback_reason).toBeNull();
    } else {
      expect(j.source).toBe("rule");
      expect(j.fallback_reason).toBe("no_key");
    }
    expect(j.fields.occurred_at).toBe("2026-08-14T18:52:00+09:00");
  });

  it("/api/extract: 코퍼스에 없는 문안 → rule + no_key", async () => {
    const { POST } = await import("@/app/api/extract/route");
    const res = await POST(post({ text: "[가상구청] 오늘 17:05경 가상동 일대 정전이 발생하였습니다.", sent_at: "2026-10-26T17:20:00+09:00", org: "가상구청" }));
    const j = await res.json();
    expect(j).toMatchObject({ ok: true, source: "rule", fallback_reason: "no_key" });
    expect(j.fields.relevant).toBe(true);
    expect(j.fields.occurred_at).toBe("2026-10-26T17:05:00+09:00");
  });

  it("/api/extract: 1,001자 → 400 text_length, 형식 오류 → 400 bad_request", async () => {
    const { POST } = await import("@/app/api/extract/route");
    const r1 = await POST(post({ text: "가".repeat(1001), sent_at: "2026-10-26T17:20:00+09:00", org: null }));
    expect(r1.status).toBe(400);
    expect(await r1.json()).toEqual({ ok: false, error: "text_length" });
    const r2 = await POST(post({ text: "정전", sent_at: "어제", org: null }));
    expect(r2.status).toBe(400);
    expect((await r2.json()).error).toBe("bad_request");
    const r3 = await POST(new Request("http://localhost/api/extract", { method: "POST", body: "{not json" }));
    expect(r3.status).toBe(400);
  });

  it("/api/brief → 템플릿 3줄", async () => {
    const { POST } = await import("@/app/api/brief/route");
    const j = await (await POST(post({ scenario_id: null, state_hash: "nohash", facts: FACTS }))).json();
    expect(j).toMatchObject({ ok: true, source: "template", fallback_reason: "no_key" });
    expect(j.lines).toHaveLength(3);
    expect(j.lines).toEqual(briefTemplate(FACTS));
    expect(j.lines[0]).toContain("휴대용 전원(대) 22분 도착 제안");
  });

  it("/api/guide → 체크리스트 5줄(⑤ 고정 문구)", async () => {
    const { POST } = await import("@/app/api/guide/route");
    const j = await (await POST(post({ device_id: "O2_STAT", safe: "0분", status: "none", arrival: null }))).json();
    expect(j).toMatchObject({ ok: true, source: "template", fallback_reason: "no_key" });
    expect(j.lines).toHaveLength(5);
    expect(j.lines[2]).toContain("예비 산소통");
    expect(j.lines[4]).toBe("남은 시간이 30분 이하이거나 숨쉬기가 평소와 다르면 바로 119에 전화하세요.");
    const bad = await POST(post({ device_id: "TOASTER", safe: "1분", status: "none", arrival: null }));
    expect(bad.status).toBe(400);
  });
});

describe("guard: 영어 칸 이름", () => {
  it("brief에 manual 같은 칸 이름이 나오면 폐기, 표시 문자열 속 라틴 낱말(ESS 등)은 허용", () => {
    const f: BriefFacts = { rows: [{ alias: "H02", device: "인공호흡기 A계열", safe: "31분", prob: "80% 안팎", margin: "19분", resource: "이동형 ESS(구청(가상 위치))", arrival: "12분", lane: "manual", excluded: [] }], changed: [], now: "20:19" };
    expect(briefOk(["H02: 31분 버팀.", "이동형 ESS가 12분 뒤 도착.", "전화 확인 필요."], f)).toBe(true);
    expect(briefOk(["H02: 31분 버팀.", "이동형 ESS가 12분 뒤 도착.", "manual 경로입니다."], f)).toBe(false);
  });
});
