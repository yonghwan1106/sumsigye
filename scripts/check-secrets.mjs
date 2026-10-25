// 키 검사 (구현명세 §11-8, 추가지시 §3): 추적 파일 + 추적 안 된 파일(node_modules·.next 제외)에서
// Anthropic 키 모양(sk-ant-… 20자 넘게 이어짐)과, --key-file로 받은 파일 속 실제 키 값(raw)을 찾는다.
// --history: git 전체 이력(git log -p --all)도 본다. 키 값은 출력하지 않는다(일치한 파일 경로·커밋만).
// 사용: node scripts/check-secrets.mjs [--key-file <경로>]... [--history]
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const keyFiles = [];
for (let i = 0; i < args.length; i++) if (args[i] === "--key-file" && args[i + 1]) keyFiles.push(args[++i]);
const history = args.includes("--history");

const SHAPE = /sk-ant-[A-Za-z0-9_-]{20,}/;
const secrets = [];
for (const f of keyFiles) {
  try {
    const raw = readFileSync(f, "utf8");
    for (const m of raw.matchAll(/sk-ant-[A-Za-z0-9_-]{20,}/g)) secrets.push(m[0]);
  } catch {
    console.error("check-secrets: key file not readable (skipped)");
  }
}

const git = (a) => execFileSync("git", ["-C", ROOT, ...a], { encoding: "utf8", maxBuffer: 1 << 28 });
const files = new Set(
  [...git(["ls-files"]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard"]).split("\n")]
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("node_modules/") && !s.startsWith(".next/")),
);

const hits = [];
for (const rel of files) {
  const abs = path.join(ROOT, rel);
  let buf;
  try {
    if (statSync(abs).size > 20 * 1024 * 1024) continue;
    buf = readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  if (SHAPE.test(buf) || secrets.some((s) => buf.includes(s))) hits.push(rel);
}

let histHits = 0;
if (history) {
  const log = git(["log", "-p", "--all", "--format=commit %h"]);
  let cur = "";
  for (const line of log.split("\n")) {
    if (line.startsWith("commit ")) cur = line.slice(7);
    else if (SHAPE.test(line) || secrets.some((s) => line.includes(s))) {
      histHits++;
      console.log(`history: ${cur}`);
    }
  }
}

for (const h of hits) console.log(`match: ${h}`);
const total = hits.length + histHits;
console.log(`${total} matches (files scanned ${files.size}, raw key values checked ${secrets.length}${history ? ", history scanned" : ""})`);
process.exit(total === 0 ? 0 : 1);
