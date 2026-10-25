// check:pii — 실종·배회 문자(개인정보)가 저장소 데이터에 들어갔는지 검사한다(구현명세 §4-1·§13-7).
// 대상: data/ 아래 모든 .json·.csv·.md 파일(추적 여부와 무관). 일치한 파일 경로·줄 번호만 출력하고 문안은 출력하지 않는다.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const PII_RE = /찾습니다|실종|배회|목격|인상착의/;
const EXT = /\.(json|csv|md|txt)$/i;

function walk(dir, out) {
  let names = [];
  try { names = readdirSync(dir); } catch { return out; }
  for (const n of names) {
    const p = join(dir, n);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (EXT.test(n)) out.push(p);
  }
  return out;
}

const files = walk(join(ROOT, "data"), []);
let matches = 0;
for (const f of files) {
  const lines = readFileSync(f, "utf8").split(/\r?\n/);
  lines.forEach((ln, i) => {
    if (PII_RE.test(ln)) {
      matches++;
      console.log(`match: ${relative(ROOT, f)}:${i + 1}`);
    }
  });
}
console.log(`check:pii — ${files.length} files scanned, ${matches} matches`);
if (matches > 0) process.exit(1);
