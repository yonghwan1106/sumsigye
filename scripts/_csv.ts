// 검수 시트 CSV 쓰기·읽기(구현명세 §4-4): UTF-8 BOM으로 쓰고, 읽을 때는 UTF-8(BOM) → 실패 시 cp949(euc-kr).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function writeCsv(path: string, header: string[], rows: unknown[][]): void {
  const lines = [header.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  writeFileSync(path, "﻿" + lines.join("\r\n") + "\r\n", "utf8");
}

export function decodeCsvBytes(buf: Buffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder("euc-kr").decode(buf);   // 엑셀 「CSV(쉼표로 분리)」 저장(cp949) 대비
  }
  return text.replace(/^﻿/, "");
}

/** RFC 4180 수준 파서(따옴표·줄바꿈 포함 칸). 첫 줄 = 머리. */
export function parseCsv(text: string): { header: string[]; rows: Record<string, string>[] } {
  const out: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c !== "")) out.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some((c) => c !== "")) out.push(row); }
  const header = (out.shift() ?? []).map((h) => h.trim());
  const rows = out.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
  return { header, rows };
}

export function readCsv(path: string): { header: string[]; rows: Record<string, string>[]; sha256: string } {
  const buf = readFileSync(path);
  return { ...parseCsv(decodeCsvBytes(buf)), sha256: createHash("sha256").update(buf).digest("hex") };
}

/** 시각 칸: HH:MM · H:MM · H:MM:SS · 「오후 3:05:00」(엑셀 자동 변환) → "HH:MM". 빈칸 → null. 해석 불가 → undefined. */
export function normClock(v: string): string | null | undefined {
  const s = v.trim();
  if (!s) return null;
  const m = s.match(/^(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!m) return undefined;
  let h = Number(m[2]); const mi = Number(m[3]);
  const ap = (m[1] || m[4] || "").toUpperCase();
  if ((ap === "오후" || ap === "PM") && h < 12) h += 12;
  if ((ap === "오전" || ap === "AM") && h === 12) h = 0;
  if (h === 24 && mi === 0) h = 0;
  if (h > 23 || mi > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/** 날짜·시각 칸: YYYY-MM-DD HH:MM · YYYY/M/D H:MM(:SS) → "+09:00" ISO. 빈칸 → null. 해석 불가 → undefined. */
export function normDateTime(v: string): string | null | undefined {
  const s = v.trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\.?\s+(.+)$/);
  if (!m) return undefined;
  const c = normClock(m[4]);
  if (!c) return undefined;
  const p = (x: string) => x.padStart(2, "0");
  return `${m[1]}-${p(m[2])}-${p(m[3])}T${c}:00+09:00`;
}
