// survival.ts 대조 시험: scipy 계산값과 허용오차(S 절대 1e-6, 분위수·부분기대값 상대 1e-5).
// 1) 내장 기준값: scipy 1.16.3 lognorm으로 계산(μ,σ 3쌍 × 경과 e 4점 × t 4점·p 3점, 단위 시간).
// 2) A 묶음 산출 `data/model/_fixture_survival.json`이 있으면 그 파일도 같은 허용오차로 대조한다.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { lnCondQuantile, lnPartialExp, lnSurv, normCdf, normInv, partialExpRemaining, quantileRemaining, survRemaining } from "../lib/engine/survival";

type Ref = { mu: number; sigma: number; e_h: number; t_h?: number; S?: number; pe_h?: number; p?: number; q_h?: number; pe_closed_h?: number };
const REF: Ref[] = [{"mu": 0.6419, "sigma": 0.7344, "e_h": 0.0, "t_h": 0.25, "S": 0.9971249582161785, "pe_h": 2.2383615681462063, "pe_closed_h": 2.238361568146207}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 0.0, "t_h": 1.0, "S": 0.8089536273404421, "pe_h": 1.5452388742129035, "pe_closed_h": 1.5452388742129028}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 0.0, "t_h": 2.0, "S": 0.47218397738246326, "pe_h": 0.9139739263637748, "pe_closed_h": 0.9139739263637747}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 0.0, "t_h": 4.0, "S": 0.15538470948713123, "pe_h": 0.3489760903770699, "pe_closed_h": 0.34897609037706967}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 0.0, "p": 0.5, "q_h": 1.9000876182926418}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 0.0, "p": 0.8, "q_h": 3.5253743666708823}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 0.0, "p": 0.9, "q_h": 4.869890585193027}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 0.5, "t_h": 0.25, "S": 0.9293020425109794, "pe_h": 1.8216670969525448, "pe_closed_h": 1.8216670969525444}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 0.5, "t_h": 1.0, "S": 0.648657741343905, "pe_h": 1.2295186454098552, "pe_closed_h": 1.2295186454098552}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 0.5, "t_h": 2.0, "S": 0.36701882967254346, "pe_h": 0.7341263079451326, "pe_closed_h": 0.7341263079451319}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 0.5, "t_h": 4.0, "S": 0.12450019100475686, "pe_h": 0.2905452733388434, "pe_closed_h": 0.2905452733388433}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 0.5, "p": 0.5, "q_h": 1.4614877406086155}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 0.5, "p": 0.8, "q_h": 3.0905356219510853}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 0.5, "p": 0.9, "q_h": 4.441714587341502}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 1.5, "t_h": 0.25, "S": 0.8696263186398107, "pe_h": 1.6620733937790435, "pe_closed_h": 1.662073393779043}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 1.5, "t_h": 1.0, "S": 0.5658127642354885, "pe_h": 1.1317621931469617, "pe_closed_h": 1.1317621931469608}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 1.5, "t_h": 2.0, "S": 0.3237756034415025, "pe_h": 0.6992702266463943, "pe_closed_h": 0.6992702266463939}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 1.5, "t_h": 4.0, "S": 0.11802884515514266, "pe_h": 0.2963636586893924, "pe_closed_h": 0.2963636586893923}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 1.5, "p": 0.5, "q_h": 1.217084206090639}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 1.5, "p": 0.8, "q_h": 2.9186042216980805}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 1.5, "p": 0.9, "q_h": 4.358016443605855}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 3.0, "t_h": 0.25, "S": 0.8704867241519924, "pe_h": 1.8434750414527297, "pe_closed_h": 1.8434750414527292}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 3.0, "t_h": 1.0, "S": 0.5819460907440877, "pe_h": 1.306983629395726, "pe_closed_h": 1.306983629395725}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 3.0, "t_h": 2.0, "S": 0.35146154592339546, "pe_h": 0.8513212808542552, "pe_closed_h": 0.8513212808542557}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 3.0, "t_h": 4.0, "S": 0.1419367883997116, "pe_h": 0.3939194500832144, "pe_closed_h": 0.39391945008321433}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 3.0, "p": 0.5, "q_h": 1.2933503511412292}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 3.0, "p": 0.8, "q_h": 3.2107881503804343}, {"mu": 0.6419, "sigma": 0.7344, "e_h": 3.0, "p": 0.9, "q_h": 4.849968388949209}, {"mu": 0.8, "sigma": 0.7, "e_h": 0.0, "t_h": 0.25, "S": 0.9991057553101583, "pe_h": 2.59343486218329, "pe_closed_h": 2.5934348621832886}, {"mu": 0.8, "sigma": 0.7, "e_h": 0.0, "t_h": 1.0, "S": 0.8734510455264423, "pe_h": 1.8770396146832204, "pe_closed_h": 1.8770396146832198}, {"mu": 0.8, "sigma": 0.7, "e_h": 0.0, "t_h": 2.0, "S": 0.5606616252896787, "pe_h": 1.1621316911585537, "pe_closed_h": 1.1621316911585533}, {"mu": 0.8, "sigma": 0.7, "e_h": 0.0, "t_h": 4.0, "S": 0.20113798541775385, "pe_h": 0.4615928124437831, "pe_closed_h": 0.4615928124437829}, {"mu": 0.8, "sigma": 0.7, "e_h": 0.0, "p": 0.5, "q_h": 2.225540928492468}, {"mu": 0.8, "sigma": 0.7, "e_h": 0.0, "p": 0.8, "q_h": 4.011378161721983}, {"mu": 0.8, "sigma": 0.7, "e_h": 0.0, "p": 0.9, "q_h": 5.458020050518741}, {"mu": 0.8, "sigma": 0.7, "e_h": 0.5, "t_h": 0.25, "S": 0.9556167650310893, "pe_h": 2.139279691992118, "pe_closed_h": 2.1392796919921175}, {"mu": 0.8, "sigma": 0.7, "e_h": 0.5, "t_h": 1.0, "S": 0.7254344065958217, "pe_h": 1.5045310486817491, "pe_closed_h": 1.5045310486817485}, {"mu": 0.8, "sigma": 0.7, "e_h": 0.5, "t_h": 2.0, "S": 0.44129094541646857, "pe_h": 0.9299558203924564, "pe_closed_h": 0.9299558203924561}, {"mu": 0.8, "sigma": 0.7, "e_h": 0.5, "t_h": 4.0, "S": 0.1598815003658148, "pe_h": 0.37872805498670414, "pe_closed_h": 0.37872805498670425}, {"mu": 0.8, "sigma": 0.7, "e_h": 0.5, "p": 0.5, "q_h": 1.757913953997519}, {"mu": 0.8, "sigma": 0.7, "e_h": 0.5, "p": 0.8, "q_h": 3.5446983462507644}, {"mu": 0.8, "sigma": 0.7, "e_h": 0.5, "p": 0.9, "q_h": 4.994189681274253}, {"mu": 0.8, "sigma": 0.7, "e_h": 1.5, "t_h": 0.25, "S": 0.8890802742974119, "pe_h": 1.8379635408983592, "pe_closed_h": 1.8379635408983583}, {"mu": 0.8, "sigma": 0.7, "e_h": 1.5, "t_h": 1.0, "S": 0.6083126763827944, "pe_h": 1.2819295747997028, "pe_closed_h": 1.2819295747997022}, {"mu": 0.8, "sigma": 0.7, "e_h": 1.5, "t_h": 2.0, "S": 0.36283319346521836, "pe_h": 0.8072049005678509, "pe_closed_h": 0.8072049005678502}, {"mu": 0.8, "sigma": 0.7, "e_h": 1.5, "t_h": 4.0, "S": 0.13748186819312253, "pe_h": 0.3467820206449177, "pe_closed_h": 0.3467820206449178}, {"mu": 0.8, "sigma": 0.7, "e_h": 1.5, "p": 0.5, "q_h": 1.3777745816896676}, {"mu": 0.8, "sigma": 0.7, "e_h": 1.5, "p": 0.8, "q_h": 3.201072787581322}, {"mu": 0.8, "sigma": 0.7, "e_h": 1.5, "p": 0.9, "q_h": 4.7094368161177975}, {"mu": 0.8, "sigma": 0.7, "e_h": 3.0, "t_h": 0.25, "S": 0.878857094816289, "pe_h": 1.9262350386848404, "pe_closed_h": 1.9262350386848393}, {"mu": 0.8, "sigma": 0.7, "e_h": 3.0, "t_h": 1.0, "S": 0.6006999432371567, "pe_h": 1.3785500319980108, "pe_closed_h": 1.3785500319980104}, {"mu": 0.8, "sigma": 0.7, "e_h": 3.0, "t_h": 2.0, "S": 0.36964316733500624, "pe_h": 0.9037548660953206, "pe_closed_h": 0.903754866095321}, {"mu": 0.8, "sigma": 0.7, "e_h": 3.0, "t_h": 4.0, "S": 0.15175551601201193, "pe_h": 0.41847870068870535, "pe_closed_h": 0.41847870068870524}, {"mu": 0.8, "sigma": 0.7, "e_h": 3.0, "p": 0.5, "q_h": 1.3714224757618227}, {"mu": 0.8, "sigma": 0.7, "e_h": 3.0, "p": 0.8, "q_h": 3.3543043438522684}, {"mu": 0.8, "sigma": 0.7, "e_h": 3.0, "p": 0.9, "q_h": 5.023082589021197}, {"mu": 1.2, "sigma": 1.1, "e_h": 0.0, "t_h": 0.25, "S": 0.9906429275441472, "pe_h": 5.830613954582563, "pe_closed_h": 5.830613954582564}, {"mu": 1.2, "sigma": 1.1, "e_h": 0.0, "t_h": 1.0, "S": 0.8623435567390187, "pe_h": 5.13111484793438, "pe_closed_h": 5.1311148479343816}, {"mu": 1.2, "sigma": 1.1, "e_h": 0.0, "t_h": 2.0, "S": 0.6775200843093798, "pe_h": 4.364459562921165, "pe_closed_h": 4.364459562921166}, {"mu": 1.2, "sigma": 1.1, "e_h": 0.0, "t_h": 4.0, "S": 0.4327573280851259, "pe_h": 3.2787484648131318, "pe_closed_h": 3.278748464813132}, {"mu": 1.2, "sigma": 1.1, "e_h": 0.0, "p": 0.5, "q_h": 3.3201169227365472}, {"mu": 1.2, "sigma": 1.1, "e_h": 0.0, "p": 0.8, "q_h": 8.379459025077672}, {"mu": 1.2, "sigma": 1.1, "e_h": 0.0, "p": 0.9, "q_h": 13.595063135525447}, {"mu": 1.2, "sigma": 1.1, "e_h": 0.5, "t_h": 0.25, "S": 0.9524785015518453, "pe_h": 5.591231539798673, "pe_closed_h": 5.591231539798674}, {"mu": 1.2, "sigma": 1.1, "e_h": 0.5, "t_h": 1.0, "S": 0.7990009768755076, "pe_h": 4.934924120707824, "pe_closed_h": 4.934924120707825}, {"mu": 1.2, "sigma": 1.1, "e_h": 0.5, "t_h": 2.0, "S": 0.6285546729328948, "pe_h": 4.225197310801398, "pe_closed_h": 4.2251973108013985}, {"mu": 1.2, "sigma": 1.1, "e_h": 0.5, "t_h": 4.0, "S": 0.40851907813479854, "pe_h": 3.209836172775279, "pe_closed_h": 3.209836172775279}, {"mu": 1.2, "sigma": 1.1, "e_h": 0.5, "p": 0.5, "q_h": 3.021151063533616}, {"mu": 1.2, "sigma": 1.1, "e_h": 0.5, "p": 0.8, "q_h": 8.168695187700996}, {"mu": 1.2, "sigma": 1.1, "e_h": 0.5, "p": 0.9, "q_h": 13.46911270623936}, {"mu": 1.2, "sigma": 1.1, "e_h": 1.5, "t_h": 0.25, "S": 0.9409458144815246, "pe_h": 5.9338271354822, "pe_closed_h": 5.9338271354822}, {"mu": 1.2, "sigma": 1.1, "e_h": 1.5, "t_h": 1.0, "S": 0.7866757252173296, "pe_h": 5.288100306615426, "pe_closed_h": 5.288100306615428}, {"mu": 1.2, "sigma": 1.1, "e_h": 1.5, "t_h": 2.0, "S": 0.6286343379704672, "pe_h": 4.584454345250333, "pe_closed_h": 4.584454345250333}, {"mu": 1.2, "sigma": 1.1, "e_h": 1.5, "t_h": 4.0, "S": 0.42246972416713396, "pe_h": 3.5524138859405654, "pe_closed_h": 3.5524138859405667}, {"mu": 1.2, "sigma": 1.1, "e_h": 1.5, "p": 0.5, "q_h": 3.113057757081309}, {"mu": 1.2, "sigma": 1.1, "e_h": 1.5, "p": 0.8, "q_h": 8.737591766440309}, {"mu": 1.2, "sigma": 1.1, "e_h": 1.5, "p": 0.9, "q_h": 14.489900064138087}, {"mu": 1.2, "sigma": 1.1, "e_h": 3.0, "t_h": 0.25, "S": 0.9460090408805725, "pe_h": 6.76405651520554, "pe_closed_h": 6.764056515205539}, {"mu": 1.2, "sigma": 1.1, "e_h": 3.0, "t_h": 1.0, "S": 0.806301832538248, "pe_h": 6.1088760930023405, "pe_closed_h": 6.108876093002341}, {"mu": 1.2, "sigma": 1.1, "e_h": 3.0, "t_h": 2.0, "S": 0.661176636697582, "pe_h": 5.378497812012099, "pe_closed_h": 5.378497812012099}, {"mu": 1.2, "sigma": 1.1, "e_h": 3.0, "t_h": 4.0, "S": 0.4636582809564673, "pe_h": 4.269990572386762, "pe_closed_h": 4.269990572386764}, {"mu": 1.2, "sigma": 1.1, "e_h": 3.0, "p": 0.5, "q_h": 3.550626324276937}, {"mu": 1.2, "sigma": 1.1, "e_h": 3.0, "p": 0.8, "q_h": 9.998793963293025}, {"mu": 1.2, "sigma": 1.1, "e_h": 3.0, "p": 0.9, "q_h": 16.51674197875639}];

const relOk = (a: number, b: number, tol = 1e-5) => Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b));

function checkRow(r: Ref): string[] {
  const errs: string[] = [];
  const se = lnSurv(r.mu, r.sigma, r.e_h);
  const d = { kind: "lognormal" as const, mu: r.mu, sigma: r.sigma, elapsed_min: r.e_h * 60, small_cell: false };
  if (r.t_h != null && r.S != null) {
    const s1 = lnSurv(r.mu, r.sigma, r.e_h + r.t_h) / se;
    const s2 = survRemaining(d, r.t_h * 60);
    if (Math.abs(s1 - r.S) > 1e-6 || Math.abs(s2 - r.S) > 1e-6) errs.push(`S mu=${r.mu} e=${r.e_h} t=${r.t_h}: ${s2} vs ${r.S}`);
  }
  if (r.t_h != null && r.pe_h != null) {
    const g1 = lnPartialExp(r.mu, r.sigma, r.e_h + r.t_h) / se;
    const g2 = partialExpRemaining(d, r.t_h * 60) / 60;
    if (!relOk(g1, r.pe_h) || !relOk(g2, r.pe_h)) errs.push(`PE mu=${r.mu} e=${r.e_h} t=${r.t_h}: ${g2} vs ${r.pe_h}`);
  }
  if (r.p != null && r.q_h != null) {
    const q1 = lnCondQuantile(r.mu, r.sigma, r.e_h, r.p);
    const q2 = quantileRemaining(d, r.p) / 60;
    if (!relOk(q1, r.q_h) || !relOk(q2, r.q_h)) errs.push(`Q mu=${r.mu} e=${r.e_h} p=${r.p}: ${q2} vs ${r.q_h}`);
  }
  return errs;
}

/** A 묶음 fixture를 너그럽게 읽는다: 배열 또는 {cases|points|rows: [...]} 안의 평평한 행, 또는 {mu,sigma,points:[...]} 묶음. */
function loadFixture(): Ref[] | null {
  const f = path.resolve(__dirname, "../data/model/_fixture_survival.json");
  if (!fs.existsSync(f)) return null;
  const j = JSON.parse(fs.readFileSync(f, "utf-8"));
  const top: unknown[] = Array.isArray(j) ? j : (j.cases ?? j.points ?? j.rows ?? j.items ?? []);
  const out: Ref[] = [];
  const num = (o: Record<string, unknown>, ...ks: string[]) => { for (const k of ks) if (typeof o[k] === "number") return o[k] as number; return undefined; };
  const push = (o: Record<string, unknown>, mu: number, sigma: number) => {
    const e = num(o, "e_h", "e", "elapsed_h") ?? 0;
    const t = num(o, "t_h", "t", "x_h", "x");
    const S = num(o, "S", "s", "surv", "cond_surv");
    const pe = num(o, "pe_h", "partial_exp_h", "pe", "partial_exp", "excess_h", "cond_partial_exp");
    const p = num(o, "p");
    const q = num(o, "q_h", "q", "quantile_h", "cond_quantile", "cond_quantile_h");
    out.push({ mu, sigma, e_h: e, t_h: t, S, pe_h: pe, p, q_h: q });
  };
  for (const c of top as Record<string, unknown>[]) {
    const mu = num(c, "mu"), sigma = num(c, "sigma");
    if (mu == null || sigma == null) continue;
    const inner = (c.points ?? c.rows ?? c.checks) as Record<string, unknown>[] | undefined;
    if (Array.isArray(inner)) inner.forEach((o) => push(o, mu, sigma)); else push(c, mu, sigma);
  }
  return out.length ? out : null;
}

describe("survival — 표준정규", () => {
  it("Φ·Φ⁻¹ 기본값", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 15);
    expect(Math.abs(normCdf(1.959963984540054) - 0.975)).toBeLessThan(1e-12);
    expect(Math.abs(normInv(0.8) - 0.8416212335729143)).toBeLessThan(1e-10);
    expect(Math.abs(normInv(1e-6) + 4.753424308822899)).toBeLessThan(1e-8);
  });
});

describe("survival — scipy 내장 기준값 대조", () => {
  it(`${REF.length}점 모두 허용오차 안`, () => {
    const errs = REF.flatMap(checkRow);
    expect(errs).toEqual([]);
  });
  it("fixed·oracle 계단", () => {
    const f = { kind: "fixed" as const, remaining_min: 120 };
    expect(survRemaining(f, 119)).toBe(1); expect(survRemaining(f, 120)).toBe(0);
    expect(quantileRemaining(f, 0.8)).toBe(120); expect(partialExpRemaining(f, 30)).toBe(90); expect(partialExpRemaining(f, 200)).toBe(0);
  });
});

describe("survival — A 묶음 fixture 대조(_fixture_survival.json)", () => {
  const fx = loadFixture();
  it.runIf(fx != null)("fixture 모든 점 허용오차 안", () => {
    expect(fx!.flatMap(checkRow)).toEqual([]);
  });
});
