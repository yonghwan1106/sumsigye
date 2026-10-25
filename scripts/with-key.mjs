// 키 실행기 (WF3 추가지시 §3): 키 파일에서 Anthropic 키를 읽어 **자식 프로세스 환경변수로만** 넘긴다.
// 키 값은 출력·파일·로그에 남기지 않는다. 명령줄에는 키 파일 경로만 들어간다.
// 사용: node scripts/with-key.mjs --key-file "<키 파일 경로>" -- <명령> [인자…]
//   예) node scripts/with-key.mjs --key-file "D:\...\api.txt" -- npm run eval:llm-baseline
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
const own = sep >= 0 ? argv.slice(0, sep) : argv;
const cmd = sep >= 0 ? argv.slice(sep + 1) : [];
const ki = own.indexOf("--key-file");
const keyFile = ki >= 0 ? own[ki + 1] : undefined;
if (!keyFile || cmd.length === 0) {
  console.error("usage: node scripts/with-key.mjs --key-file <path> -- <command> [args...]");
  process.exit(2);
}

let key = "";
try {
  const raw = readFileSync(keyFile, "utf8");
  const m = raw.match(/sk-ant-api03-[A-Za-z0-9_\-]+/);
  key = m ? m[0] : "";
} catch {
  console.error("with-key: key file not readable");
  process.exit(3);
}
if (!key) {
  console.error("with-key: no key pattern found in key file");
  process.exit(3);
}

const env = { ...process.env, ANTHROPIC_API_KEY: key };
key = "";
const isWin = process.platform === "win32";
const quote = (s) => (/[\s"&|<>^]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
const child = isWin
  ? spawn(cmd.map(quote).join(" "), { env, stdio: "inherit", shell: true })
  : spawn(cmd[0], cmd.slice(1), { env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
