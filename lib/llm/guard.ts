// LLM 설명 문장 검사 (구현명세 §7-3·§7-4) — 통과하지 못하면 폐기하고 템플릿/체크리스트 원문을 쓴다.

/** 숫자가 든 토막(§7-3 정규식). */
export const NUMBER_TOKEN = /\d[\d.,]*\s*(분|시간|%|곳|대|km|W)?/g;

// §7-3의 금지 표현 + 승인 부탁·확정 서술(실측에서 나온 표현)
export const FORBIDDEN_BRIEF = /승인하세요|승인을 권|승인해 주|승인 바랍|승인을 부탁|반드시 보내|확실히|배정되었습니다/;
export const FORBIDDEN_GUIDE = /처방|투약|용량을 늘|유량을 바꾸|설정을 바꾸|진단/;

export function numberTokens(text: string): string[] {
  return Array.from(text.matchAll(NUMBER_TOKEN), (m) => m[0].trim()).filter(Boolean);
}

/** 문장 속 숫자 토막이 모두 허용 문자열 집합 어딘가에 글자 그대로 있는가. */
export function numbersGrounded(lines: string[], allowed: string[]): boolean {
  const hay = allowed.join("\n");
  return lines.every((l) => numberTokens(l).every((tok) => hay.includes(tok)));
}

/** LLM 응답 글 → 줄 n개(줄머리 기호·번호 제거). 개수가 다르면 null. */
export function parseLines(text: string, n: number): string[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)]|[①②③④⑤])\s*/, "").trim())
    .filter((l) => l.length > 0);
  return lines.length === n ? lines : null;
}

/** 객체 안 모든 문자열(중첩 포함). */
export function collectStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, out));
  else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach((x) => collectStrings(x, out));
  return out;
}

/** 라틴 글자 낱말(2자 이상)은 허용 문자열 안에 있는 것만(화면에 영어 문구 금지 — §8-0). */
export function latinGrounded(lines: string[], allowed: string[]): boolean {
  const hay = allowed.join("\n");
  return lines.every((l) => (l.match(/[A-Za-z]{2,}/g) ?? []).every((w) => hay.includes(w)));
}

export function briefOk(lines: string[], facts: unknown, n = 3): boolean {
  if (lines.length !== n) return false;
  if (lines.some((l) => FORBIDDEN_BRIEF.test(l))) return false;
  const all = collectStrings(facts);
  // lane 코드(119·manual·main)는 화면 문장에 쓰지 않는다 → 라틴 낱말 허용 목록에서 뺀다.
  const noLane = collectStrings(
    facts && typeof facts === "object" && Array.isArray((facts as { rows?: unknown[] }).rows)
      ? { ...(facts as object), rows: (facts as { rows: Record<string, unknown>[] }).rows.map(({ lane: _lane, ...rest }) => rest) }
      : facts,
  );
  return numbersGrounded(lines, all) && latinGrounded(lines, noLane);
}

/** 체크리스트 항목별 핵심 낱말(모두 들어 있어야 한다). 5번째 줄은 원문과 같아야 한다. */
export function guideOk(lines: string[], checklist: string[], keywords: string[][], context: string[]): boolean {
  if (lines.length !== 5 || checklist.length !== 5) return false;
  if (lines.some((l) => FORBIDDEN_GUIDE.test(l))) return false;
  if (lines[4] !== checklist[4]) return false;
  for (let i = 0; i < 5; i++) {
    if (!keywords[i].every((k) => lines[i].includes(k))) return false;
  }
  return numbersGrounded(lines, [...checklist, ...context]) && latinGrounded(lines, [...checklist, ...context]);
}
