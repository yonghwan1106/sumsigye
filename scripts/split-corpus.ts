// P2 분리 (구현명세 §4-2 + 공통 추가지시 §4: 골드 60행, 층 20·15·10·15)
// 규칙 추출기 코드보다 먼저 커밋한다. 골드 행의 문안은 출력하지 않는다(sn·층 개수만).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SmsRow } from "../lib/types";
import { mulberry32 } from "./_rng";

const ROOT = join(__dirname, "..");
const CORPUS = join(ROOT, "data", "sms", "corpus.json");
const SPLIT = join(ROOT, "data", "sms", "split.json");

export const SEED = 20261026;
export const FIXTURES = [266510, 266511, 254509, 254510, 254516, 254517, 266838, 266843, 266844, 250936, 269705, 269706];

export type Stratum = "restore" | "forecast" | "unrelated" | "other";
const STRATA: Stratum[] = ["restore", "forecast", "unrelated", "other"];
// 추가지시 §4: 80행(25·20·15·20) → 60행(20·15·10·15)
const QUOTA: Record<Stratum, number> = { restore: 20, forecast: 15, unrelated: 10, other: 15 };

const RE_RESTORE = /복구\s*완료|복구완료|복전|복구되었|정상화|복구 됨/;
const RE_FORECAST = /예상|예정|소요|까지/;
const RE_UNRELATED = /신호등|정수장|가압장|단수|전차선|열차|지하철|역사|운행|절전|에어컨|적정 온도|훈련/;

export function stratumOf(text: string): Stratum {
  if (RE_RESTORE.test(text)) return "restore";
  if (RE_FORECAST.test(text)) return "forecast";
  if (RE_UNRELATED.test(text)) return "unrelated";
  return "other";
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function main() {
  const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as { meta: Record<string, unknown>; items: Omit<SmsRow, "split" | "fixture">[] };
  const items = corpus.items.slice().sort((a, b) => a.sn - b.sn);
  const fx = new Set(FIXTURES);
  const missingFx = FIXTURES.filter((sn) => !items.some((r) => r.sn === sn));
  if (missingFx.length) throw new Error("fixture sn missing in corpus: " + missingFx.join(","));

  const pool: Record<Stratum, number[]> = { restore: [], forecast: [], unrelated: [], other: [] };
  for (const r of items) if (!fx.has(r.sn)) pool[stratumOf(r.text)].push(r.sn);
  const strata_counts = Object.fromEntries(STRATA.map((s) => [s, pool[s].length])) as Record<Stratum, number>;

  const rnd = mulberry32(SEED);
  const shuffled: Record<Stratum, number[]> = {
    restore: shuffle(pool.restore, rnd), forecast: shuffle(pool.forecast, rnd),
    unrelated: shuffle(pool.unrelated, rnd), other: shuffle(pool.other, rnd),
  };
  const picked: Record<Stratum, number[]> = { restore: [], forecast: [], unrelated: [], other: [] };
  let shortfall = 0;
  for (const s of STRATA) {
    const take = shuffled[s].slice(0, QUOTA[s]);
    picked[s] = take;
    shortfall += QUOTA[s] - take.length;
  }
  // 층 인원이 모자라면 ④(그 밖)에서 채운다
  if (shortfall > 0) {
    const extra = shuffled.other.slice(picked.other.length, picked.other.length + shortfall);
    picked.other = picked.other.concat(extra);
  }
  // 시트 순서: 층을 번갈아(복구·예고·무관·그 밖 …)
  const order: { sn: number; stratum: Stratum }[] = [];
  const idx: Record<Stratum, number> = { restore: 0, forecast: 0, unrelated: 0, other: 0 };
  while (order.length < STRATA.reduce((n, s) => n + picked[s].length, 0)) {
    for (const s of STRATA) {
      if (idx[s] < picked[s].length) order.push({ sn: picked[s][idx[s]++], stratum: s });
    }
  }
  const goldSet = new Set(order.map((o) => o.sn));

  const out: SmsRow[] = corpus.items.map((r) => ({ ...r, split: goldSet.has(r.sn) ? "gold" : "dev", fixture: fx.has(r.sn) }));
  writeFileSync(CORPUS, JSON.stringify({ meta: { ...corpus.meta, split_seed: SEED }, items: out }, null, 1), "utf8");

  const split = {
    seed: SEED,
    rng: "mulberry32",
    fixtures: FIXTURES,
    quota: QUOTA,
    note: "공통 추가지시 §4에 따라 골드 60행(층 20·15·10·15). 층 판정은 문안 낱말 정규식만(§4-2).",
    strata_counts,
    gold_picked: Object.fromEntries(STRATA.map((s) => [s, picked[s].length])),
    gold_sns: order.map((o) => o.sn),
    gold_order: order.map((o, i) => ({ order: i + 1, sn: o.sn, stratum: o.stratum })),
    gold_count: order.length,
    dev_count: out.length - order.length,
    created_at: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(" ", "T") + "+09:00",
  };
  writeFileSync(SPLIT, JSON.stringify(split, null, 1), "utf8");
  console.log(`split: corpus ${out.length}, gold ${order.length} (${STRATA.map((s) => `${s} ${picked[s].length}/${strata_counts[s]}`).join(", ")}), dev ${split.dev_count}, fixtures ${FIXTURES.length}`);
}

main();
