# -*- coding: utf-8 -*-
"""L2 diagnosis of the existing parametric candidates M0/M1/M2 (before the 10/26 candidate revision).

Writes the numbers used in docs/L2_diagnosis.md. Only the existing models are evaluated here;
the new candidates (E0, NP) are evaluated only after docs/L2_revision.md is committed.
Usage: python pipeline/diagnose_restore.py --events data/events/events.json --out data/eval/l2_diagnosis.json
ASCII source. Units: hours.
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fit_restore as fr  # noqa: E402

TAUS = (0.5, 0.8, 0.9)


def qset(fm, e):
    mu = fr.mu_of(fm, e)
    return {t: fr.q_ln(mu, fm["sigma"], t) for t in TAUS}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--events", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    with open(a.events, encoding="utf-8") as f:
        evf = json.load(f)
    used = fr.prepare(evf["events"])
    kinds = [e["_kind"] for e in used]
    exact_t = np.array([e["_t"] for e in used if e["_kind"] == "exact"])
    right_lo = np.array([e["_lo"] for e in used if e["_kind"] == "right"])
    ints = [(e["_lo"], e["_hi"]) for e in used if e["_kind"] == "interval"]

    # A. which censored events drive sigma (M0 full-sample fits on subsets)
    subsets = {
        "exact": [e for e in used if e["_kind"] == "exact"],
        "exact+interval": [e for e in used if e["_kind"] in ("exact", "interval")],
        "exact+interval+right": used,
    }
    sub_rows = []
    for key, evs in subsets.items():
        fm = fr.fit(fr.Data(evs), ["intercept"])
        q = qset(fm, {"night": False, "group": "G1"})
        sub_rows.append({"subset": key, "n": len(evs), "mu": round(fm["coef"]["intercept"], 4), "sigma": round(fm["sigma"], 4),
                         "p50_h": round(q[0.5], 3), "p80_h": round(q[0.8], 3), "p90_h": round(q[0.9], 3)})

    # B. LOO calibration per quantile (same LOO as fit_restore.run)
    targets = [i for i, e in enumerate(used) if e["_kind"] in ("exact", "interval")]
    calib = {}
    for m, names in fr.MODELS.items():
        ex = {t: [] for t in TAUS}
        iv = {t: {"hit": 0, "miss": 0, "undetermined": 0} for t in TAUS}
        sig = []
        for i in targets:
            rest = [e for j, e in enumerate(used) if j != i]
            fm = fr.fit(fr.Data(rest), names)
            sig.append(fm["sigma"])
            ei = used[i]
            q = qset(fm, ei)
            for t in TAUS:
                if ei["_kind"] == "exact":
                    ex[t].append((ei["_t"], q[t]))
                else:
                    if q[t] >= ei["_hi"]:
                        iv[t]["hit"] += 1
                    elif q[t] < ei["_lo"]:
                        iv[t]["miss"] += 1
                    else:
                        iv[t]["undetermined"] += 1
        rows = []
        for t in TAUS:
            cov = sum(1 for y, q in ex[t] if y <= q)
            rows.append({"tau": t, "exact_cov": fr.wilson(cov, len(ex[t])),
                         "exact_pinball": round(float(np.mean([fr.pinball(y, q, t) for y, q in ex[t]])), 4),
                         "mean_q_h": round(float(np.mean([q for _, q in ex[t]])), 3),
                         "empirical_q_h": round(float(np.quantile(exact_t, t, method="linear")), 3),
                         "interval": iv[t]})
        calib[m] = {"loo_sigma_min": round(min(sig), 4), "loo_sigma_max": round(max(sig), 4), "rows": rows}

    # C. tail facts
    tail = {
        "exact_max_h": round(float(exact_t.max()), 3),
        "interval_upper_max_h": round(max(h for _, h in ints), 3),
        "right_n": int(len(right_lo)),
        "right_lo_quantiles_h": [round(float(x), 3) for x in np.quantile(right_lo, [0.25, 0.5, 0.75, 0.9])],
        "right_lo_max_h": round(float(right_lo.max()), 3),
        "right_lo_above_exact_max": int(np.sum(right_lo > exact_t.max())),
        "right_lo_above_4_6h": int(np.sum(right_lo > 4.615)),
        "n_by_kind": {k: kinds.count(k) for k in ("exact", "interval", "right")},
    }
    out = {"subsets": sub_rows, "loo_calibration": calib, "tail": tail}
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
