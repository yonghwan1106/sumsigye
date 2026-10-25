# -*- coding: utf-8 -*-
"""P10 / L2: restore-time models with interval and right censoring.

Candidates: M0/M1/M2 log-normal AFT (spec 5-2) + E0 (empirical distribution of exact durations) and
NP (Turnbull NPMLE by EM), added 2026-10-26 under the pre-registration docs/L2_revision.md.
Nonparametric fits are piecewise-uniform distributions: list of [a, b, w] (a == b is a point mass).

Spec: E1 implementation spec section 5-2 (and 6-5, 6-10). ASCII source; Korean labels as \\u escapes.
Usage:
  python pipeline/fit_restore.py --events data/events/events.json --model-out data/model/restore_model.json \
      --results-out data/eval/l2_results.json --fixture-out data/model/_fixture_survival.json
  python pipeline/fit_restore.py --selftest
Units: hours. Needs numpy 2.2.6 and scipy 1.16.3 (user site-packages; do not run with python -I).
"""
import argparse
import datetime as dt
import json
import math
import os
import sys

import numpy as np
from scipy import integrate, optimize, stats
from scipy.special import log_ndtr

KST = dt.timezone(dt.timedelta(hours=9))
TAUS = (0.5, 0.8, 0.9)
Z95 = 1.959963984540054
MODELS = {"M0": ["intercept"], "M1": ["intercept", "night"], "M2": ["intercept", "G2", "G3", "night"]}
SPLIT_AT = "2026-07-01T00:00:00+09:00"
NONPARAM = ("E0", "NP")
# pre-registered simplicity order (docs/L2_revision.md section 2): ties within 2% go to the earlier one
SIMPLICITY = ("M0", "M1", "M2", "E0", "NP")
PREREG_COMMIT = "2b246e4"   # commit of docs/L2_revision.md, made before E0/NP were evaluated
NP_TOL = 1e-10
NP_MAXIT = 20000
NP_DROP = 1e-12

LABELS = {
    "M0": "M0 전체",                              # overall
    "M1": "M1 야간",                              # night
    "M2": "M2 원인군 3+야간",          # cause group 3 + night
    "E0": "E0 정확 사건 경험분포",  # empirical distribution of exact events
    "NP": "NP 비모수(Turnbull)",          # nonparametric Turnbull NPMLE
    "B0": "고정 2시간",                    # fixed 2 hours
    "B1": "관측 경험분위",          # empirical quantiles
    "B2": "기관 예고(발생 기준 해석)",   # agency forecast, occurrence-based reading
    "B2s": "기관 예고(발송 기준 해석)",  # agency forecast, sent-based reading
}


def now_iso():
    return dt.datetime.now(KST).strftime("%Y-%m-%dT%H:%M:%S") + "+09:00"


def parse_iso(s):
    return dt.datetime.fromisoformat(s)


# ---------------------------------------------------------------- likelihood
class Data(object):
    def __init__(self, events):
        self.ev = events
        self.kind = np.array([e["_kind"] for e in events])
        self.t = np.array([e.get("_t", np.nan) for e in events], dtype=float)
        self.lo = np.array([e.get("_lo", np.nan) for e in events], dtype=float)
        self.hi = np.array([e.get("_hi", np.nan) for e in events], dtype=float)
        self.cov = {
            "intercept": np.ones(len(events)),
            "night": np.array([1.0 if e["night"] else 0.0 for e in events]),
            "G2": np.array([1.0 if e["group"] == "G2" else 0.0 for e in events]),
            "G3": np.array([1.0 if e["group"] == "G3" else 0.0 for e in events]),
        }

    def X(self, names):
        return np.column_stack([self.cov[n] for n in names]) if len(self.ev) else np.zeros((0, len(names)))


def negloglik(theta, X, d):
    k = X.shape[1]
    beta, logs = theta[:k], theta[k]
    s = math.exp(logs)
    mu = X @ beta
    ll = 0.0
    ex = d.kind == "exact"
    if ex.any():
        z = (np.log(d.t[ex]) - mu[ex]) / s
        ll += np.sum(-0.5 * z * z - 0.5 * math.log(2 * math.pi) - logs - np.log(d.t[ex]))
    iv = d.kind == "interval"
    if iv.any():
        zu = (np.log(d.hi[iv]) - mu[iv]) / s
        lo = d.lo[iv]
        lu = log_ndtr(zu)
        with np.errstate(divide="ignore"):
            zl = np.where(lo > 0, (np.log(np.where(lo > 0, lo, 1.0)) - mu[iv]) / s, -np.inf)
        ll_l = log_ndtr(zl)
        diff = np.exp(np.minimum(ll_l - lu, 0.0))
        ll += np.sum(lu + np.log1p(-np.minimum(diff, 1 - 1e-15)))
    rt = d.kind == "right"
    if rt.any():
        zl = (np.log(d.lo[rt]) - mu[rt]) / s
        ll += np.sum(log_ndtr(-zl))
    return -ll


def fit(d, names):
    X = d.X(names)
    ex = d.kind == "exact"
    b0 = float(np.mean(np.log(d.t[ex]))) if ex.any() else 0.5
    x0 = np.zeros(len(names) + 1)
    x0[0] = b0
    res = optimize.minimize(negloglik, x0, args=(X, d), method="L-BFGS-B")
    if not res.success or not np.isfinite(res.fun):
        res2 = optimize.minimize(negloglik, res.x if np.all(np.isfinite(res.x)) else x0, args=(X, d), method="Nelder-Mead",
                                 options={"maxiter": 20000, "xatol": 1e-8, "fatol": 1e-10})
        if np.isfinite(res2.fun) and (not np.isfinite(res.fun) or res2.fun <= res.fun):
            res = res2
    beta = res.x[: len(names)]
    sigma = math.exp(res.x[len(names)])
    coef = {"intercept": 0.0, "night": 0.0, "G2": 0.0, "G3": 0.0}
    for n, b in zip(names, beta):
        coef[n] = float(b)
    return {"coef": coef, "sigma": float(sigma), "loglik": float(-res.fun), "k": len(names) + 1}


def mu_of(m, e):
    c = m["coef"]
    return c["intercept"] + (c["night"] if e["night"] else 0.0) + (c["G2"] if e["group"] == "G2" else 0.0) + (c["G3"] if e["group"] == "G3" else 0.0)


def q_ln(mu, sigma, p):
    return math.exp(mu + sigma * stats.norm.ppf(p))


# ---------------------------------------------------------------- piecewise-uniform distributions (E0, NP)
def pw_sf(segs, t):
    """P(T > t)."""
    s = 0.0
    for a, b, w in segs:
        if a > t:
            s += w
        elif b > t:
            s += w * (b - t) / (b - a)
    return s


def pw_quantile(segs, p):
    """inf{t: F(t) >= p}, linear inside uniform pieces."""
    if p <= 0:
        return segs[0][0]
    cum = 0.0
    for a, b, w in segs:
        if cum + w >= p - 1e-15:
            if b == a or w <= 0:
                return a
            return a + min(1.0, max(0.0, (p - cum) / w)) * (b - a)
        cum += w
    return segs[-1][1]


def pw_cond_quantile(segs, e, p):
    """Remaining-time p quantile given elapsed e (same definition as the log-normal one)."""
    se = pw_sf(segs, e)
    return max(0.0, pw_quantile(segs, 1 - (1 - p) * se) - e)


def pw_partial_exp(segs, x):
    """E[(T - x)+]."""
    g = 0.0
    for a, b, w in segs:
        if b == a:
            g += w * max(0.0, a - x)
        elif x <= a:
            g += w * ((a + b) / 2.0 - x)
        elif x < b:
            g += w * (b - x) ** 2 / (2.0 * (b - a))
    return g


def fit_e0(exact_t):
    x = sorted(float(v) for v in exact_t)
    n = len(x)
    if n == 0:
        return None
    if n == 1:
        segs = [[x[0], x[0], 1.0]]
    else:
        segs = [[x[k], x[k + 1], 1.0 / (n - 1)] for k in range(n - 1)]
    return {"segs": segs, "k": n}


def obs_intervals(d):
    """Closed observation intervals [L, R] (R = inf for right censoring)."""
    L, R = [], []
    for kind, t, lo, hi in zip(d.kind, d.t, d.lo, d.hi):
        if kind == "exact":
            L.append(t); R.append(t)
        elif kind == "interval":
            L.append(lo); R.append(hi)
        else:
            L.append(lo); R.append(math.inf)
    return np.array(L, dtype=float), np.array(R, dtype=float)


def turnbull_intervals(L, R):
    pts = sorted([(v, 0) for v in L] + [(v, 1) for v in R])   # ties: left endpoints first (closed intervals)
    out = []
    for (v0, k0), (v1, k1) in zip(pts, pts[1:]):
        if k0 == 0 and k1 == 1 and (not out or out[-1] != (v0, v1)):
            out.append((v0, v1))
    return out


def fit_np(d, track=False):
    """Turnbull NPMLE by EM (self-consistency). Deterministic: uniform start."""
    L, R = obs_intervals(d)
    iv = turnbull_intervals(L, R)
    q = np.array([a for a, _ in iv])
    pr = np.array([b for _, b in iv])
    n, m = len(L), len(iv)
    # each observation covers a contiguous run [lo_i, hi_i] of Turnbull intervals
    lo_i = np.searchsorted(q, L, side="left")
    hi_i = np.searchsorted(pr, R, side="right") - 1
    if np.any(hi_i < lo_i):
        raise RuntimeError("observation covers no Turnbull interval")
    p = np.full(m, 1.0 / m)
    lls = []
    it = 0
    for it in range(1, NP_MAXIT + 1):
        C = np.concatenate([[0.0], np.cumsum(p)])
        den = C[hi_i + 1] - C[lo_i]
        if track:
            lls.append(float(np.sum(np.log(den))))
        acc = np.zeros(m + 1)
        np.add.at(acc, lo_i, 1.0 / den)
        np.add.at(acc, hi_i + 1, -1.0 / den)
        newp = p * np.cumsum(acc)[:m] / n
        delta = float(np.max(np.abs(newp - p)))
        p = newp
        if delta < NP_TOL:
            break
    C = np.concatenate([[0.0], np.cumsum(p)])
    ll = float(np.sum(np.log(C[hi_i + 1] - C[lo_i])))
    keep = p >= NP_DROP
    w = p[keep] / p[keep].sum()
    segs = []
    for (a, b), wj in zip([iv[j] for j in np.nonzero(keep)[0]], w):
        b2 = a if math.isinf(b) else b              # unbounded mass -> point mass at its left end (Efron)
        segs.append([float(a), float(b2), float(wj)])
    out = {"segs": segs, "k": len(segs), "loglik": ll, "iters": it, "m": m}
    if track:
        out["lls"] = lls
    return out


def fit_nonparam(model_id, d):
    if model_id == "E0":
        return fit_e0(d.t[d.kind == "exact"])
    return fit_np(d)


def round_segs(segs):
    return [[round(a, 6), round(b, 6), round(w, 9)] for a, b, w in segs]


# ---------------------------------------------------------------- metrics
def pinball(y, q, tau):
    d = y - q
    return max(tau * d, (tau - 1) * d)


def wilson(a, n, z=Z95):
    if n == 0:
        return None
    p = a / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return {"a": int(a), "n": int(n), "lo": round(max(0.0, c - h), 4), "hi": round(min(1.0, c + h), 4)}


def r4(x):
    return None if x is None else round(float(x), 4)


def summarize(preds, with_cov=True):
    """preds: list of (y, {tau: q}) for exact events."""
    n = len(preds)
    if n == 0:
        return None
    pb = {tau: float(np.mean([pinball(y, q[tau], tau) for y, q in preds])) for tau in TAUS}
    out = {
        "n": n,
        "pinball": {"t50": r4(pb[0.5]), "t80": r4(pb[0.8]), "t90": r4(pb[0.9]), "mean": r4(np.mean(list(pb.values())))},
        "p80_mean_h": r4(np.mean([q[0.8] for _, q in preds])),
        "cov80": None, "cov90": None,
    }
    if with_cov:
        out["cov80"] = wilson(sum(1 for y, q in preds if y <= q[0.8]), n)
        out["cov90"] = wilson(sum(1 for y, q in preds if y <= q[0.9]), n)
    return out


# ---------------------------------------------------------------- main fit
def prepare(events):
    used = []
    for e in events:
        o = e["outcome"]
        if o == "excluded":
            continue
        e = dict(e)
        e["_kind"] = o
        if o == "exact":
            if not (e["duration_h"] and e["duration_h"] > 0):
                continue
            e["_t"] = float(e["duration_h"])
        elif o == "interval":
            if not (e["upper_h"] and e["upper_h"] > 0):
                continue
            e["_lo"] = float(e["lower_h"] or 0.0)
            e["_hi"] = float(e["upper_h"])
        elif o == "right":
            if not (e["lower_h"] and e["lower_h"] > 0):
                continue
            e["_lo"] = float(e["lower_h"])
        used.append(e)
    return used


def forecast_h(e):
    """Agency forecast duration (hours) under two readings: (occurrence-based, sent-based)."""
    eta = e.get("eta")
    if not eta or not e.get("start_at"):
        return None
    st = parse_iso(e["start_at"])
    if eta.get("eta_at"):
        v = (parse_iso(eta["eta_at"]) - st).total_seconds() / 3600.0
        return (v, v) if v > 0 else None
    if eta.get("eta_range"):
        a = (parse_iso(eta["eta_range"][0]) - st).total_seconds() / 3600.0
        b = (parse_iso(eta["eta_range"][1]) - st).total_seconds() / 3600.0
        if a > 0 and b > 0:
            return (a, b)
    return None


def run(args):
    with open(args.events, encoding="utf-8") as f:
        evf = json.load(f)
    events = evf["events"]
    reviewed = bool(evf["meta"].get("reviewed"))
    used = prepare(events)
    d = Data(used)
    n_exact = int(np.sum(d.kind == "exact"))
    n_interval = int(np.sum(d.kind == "interval"))
    n_right = int(np.sum(d.kind == "right"))
    n_excluded = len(events) - len(used)

    fits = {m: fit(d, names) for m, names in MODELS.items()}
    lr = []
    for big, small, df in (("M1", "M0", 1), ("M2", "M0", 3), ("M2", "M1", 2)):
        chi2 = max(0.0, 2 * (fits[big]["loglik"] - fits[small]["loglik"]))
        lr.append({"model": big, "vs": small, "chi2": round(chi2, 4), "df": df, "p": round(float(stats.chi2.sf(chi2, df)), 4)})

    # ---- LOO over exact + interval events
    targets = [i for i, e in enumerate(used) if e["_kind"] in ("exact", "interval")]
    CANDS = list(MODELS) + list(NONPARAM)
    loo_pred = {m: [] for m in CANDS}      # exact: (y, q)
    loo_int = {m: [] for m in CANDS}       # interval: (lo, hi, q80)
    loo_params = {m: {} for m in CANDS}
    b0_pred, b1_pred, b2_pred, b2s_pred = [], [], [], []
    exact_all = [(i, used[i]["_t"]) for i in range(len(used)) if used[i]["_kind"] == "exact"]
    for i in targets:
        rest = [e for j, e in enumerate(used) if j != i]
        di = Data(rest)
        ei = used[i]
        for m, names in MODELS.items():
            fm = fit(di, names)
            loo_params[m][ei["event_id"]] = fm
            mu = mu_of(fm, ei)
            q = {tau: q_ln(mu, fm["sigma"], tau) for tau in TAUS}
            if ei["_kind"] == "exact":
                loo_pred[m].append((ei["_t"], q))
            else:
                loo_int[m].append((ei["_lo"], ei["_hi"], q[0.8]))
        for m in NONPARAM:
            fm = fit_nonparam(m, di)
            loo_params[m][ei["event_id"]] = fm
            q = {tau: pw_quantile(fm["segs"], tau) for tau in TAUS}
            if ei["_kind"] == "exact":
                loo_pred[m].append((ei["_t"], q))
            else:
                loo_int[m].append((ei["_lo"], ei["_hi"], q[0.8]))
        if ei["_kind"] == "exact":
            y = ei["_t"]
            b0_pred.append((y, {tau: 2.0 for tau in TAUS}))
            others = np.array([t for j, t in exact_all if j != i])
            if len(others):
                b1_pred.append((y, {tau: float(np.quantile(others, tau, method="linear")) for tau in TAUS}))
            fc = forecast_h(ei)
            if fc:
                b2_pred.append((y, {tau: fc[0] for tau in TAUS}))
                b2s_pred.append((y, {tau: fc[1] for tau in TAUS}))

    def int_cov(m):
        h = sum(1 for lo, hi, q in loo_int[m] if q >= hi)
        mi = sum(1 for lo, hi, q in loo_int[m] if q < lo)
        return {"hit": h, "miss": mi, "undetermined": len(loo_int[m]) - h - mi}

    rows = []
    for m in CANDS:
        s = summarize(loo_pred[m])
        if s:
            rows.append(dict(id=m, label=LABELS[m], candidate=True, interval_p80=int_cov(m), **s))
    # selection (pre-registered, docs/L2_revision.md): lowest LOO mean pinball; within 2% -> simpler by SIMPLICITY order
    cand = [r for r in rows if r["id"] in CANDS]
    if cand:
        best = min(r["pinball"]["mean"] for r in cand)
        ok = [r for r in cand if r["pinball"]["mean"] <= best * 1.02]
        selected = sorted(ok, key=lambda r: (SIMPLICITY.index(r["id"]), r["pinball"]["mean"]))[0]["id"]
    else:
        selected = "M0"
    nonparam_sel = selected in NONPARAM
    np_full = {m: fit_nonparam(m, d) for m in NONPARAM}
    s0 = summarize(b0_pred, with_cov=False)
    if s0:
        rows.append(dict(id="B0", label=LABELS["B0"], **s0))
    s1 = summarize(b1_pred)
    if s1:
        rows.append(dict(id="B1", label=LABELS["B1"], **s1))
    s2 = summarize(b2_pred, with_cov=False)
    if s2:
        r2 = dict(id="B2", label=LABELS["B2"], **s2)
        s2s = summarize(b2s_pred, with_cov=False)
        if s2s:
            r2["alt"] = dict(label=LABELS["B2s"], **s2s)
        rows.append(r2)

    hit = sum(1 for lo, hi, q in loo_int[selected] if q >= hi)
    miss = sum(1 for lo, hi, q in loo_int[selected] if q < lo)
    und = len(loo_int[selected]) - hit - miss

    # ---- time split (auxiliary)
    train = [e for e in used if e.get("start_at") and e["start_at"] < SPLIT_AT]
    test = [e for e in used if e.get("start_at") and e["start_at"] >= SPLIT_AT and e["_kind"] == "exact"]
    ts_rows = []
    if train and test:
        dtr = Data(train)
        for m, names in MODELS.items():
            fm = fit(dtr, names)
            preds = [(e["_t"], {tau: q_ln(mu_of(fm, e), fm["sigma"], tau) for tau in TAUS}) for e in test]
            s = summarize(preds)
            ts_rows.append({"id": m, "pinball_mean": s["pinball"]["mean"], "cov80": s["cov80"]})
        for m in NONPARAM:
            fm = fit_nonparam(m, dtr)
            if fm:
                s = summarize([(e["_t"], {tau: pw_quantile(fm["segs"], tau) for tau in TAUS}) for e in test])
                ts_rows.append({"id": m, "pinball_mean": s["pinball"]["mean"], "cov80": s["cov80"]})
        s = summarize([(e["_t"], {tau: 2.0 for tau in TAUS}) for e in test], with_cov=False)
        ts_rows.append({"id": "B0", "pinball_mean": s["pinball"]["mean"], "cov80": None})
        tr_exact = np.array([e["_t"] for e in train if e["_kind"] == "exact"])
        if len(tr_exact):
            s = summarize([(e["_t"], {tau: float(np.quantile(tr_exact, tau, method="linear")) for tau in TAUS}) for e in test])
            ts_rows.append({"id": "B1", "pinball_mean": s["pinball"]["mean"], "cov80": s["cov80"]})

    # ---- cells of the selected model
    sm = fits[selected] if not nonparam_sel else None
    cells = []
    groups = ["G1", "G2", "G3"] if not nonparam_sel and "G2" in MODELS[selected] else ["all"]
    nights = [False, True] if not nonparam_sel and "night" in MODELS[selected] else ["all"]
    for g in groups:
        if nonparam_sel:
            segs = np_full[selected]["segs"]
            n_cell = sum(1 for e in used if e["_kind"] in ("exact", "interval"))
            cells.append({"group": "all", "night": "all", "n_cell": n_cell, "small": n_cell < 5, "mu": None, "sigma": None,
                          "p50_h": round(pw_quantile(segs, 0.5), 4), "p80_h": round(pw_quantile(segs, 0.8), 4), "p90_h": round(pw_quantile(segs, 0.9), 4)})
            continue
        for nt in nights:
            members = [e for e in used if e["_kind"] in ("exact", "interval")
                       and (g == "all" or e["group"] == g) and (nt == "all" or bool(e["night"]) == nt)]
            fake = {"night": nt is True, "group": g if g != "all" else "G1"}
            mu = mu_of(sm, fake)
            cells.append({
                "group": g, "night": nt, "n_cell": len(members), "small": len(members) < 5,
                "mu": round(mu, 4), "sigma": round(sm["sigma"], 4),
                "p50_h": round(q_ln(mu, sm["sigma"], 0.5), 4), "p80_h": round(q_ln(mu, sm["sigma"], 0.8), 4), "p90_h": round(q_ln(mu, sm["sigma"], 0.9), 4),
            })

    starts = sorted(e["start_at"] for e in used if e.get("start_at"))
    fetch_log_p = os.path.join(os.path.dirname(os.path.abspath(args.events)), "..", "sms", "fetch_log.json")
    corpus_n, collected = 0, now_iso()
    if os.path.exists(fetch_log_p):
        with open(fetch_log_p, encoding="utf-8") as f:
            fl = json.load(f)
        corpus_n, collected = int(fl.get("n_unique", 0)), fl.get("fetched_at", collected)
    data_block = {"n_exact": n_exact, "n_interval": n_interval, "n_right": n_right, "n_excluded": n_excluded,
                  "period": [starts[0], starts[-1]] if starts else [collected, collected], "corpus_n": corpus_n, "collected_at": collected}

    def rnd_model(m):
        return {"coef": {k: round(v, 6) for k, v in m["coef"].items()}, "sigma": round(m["sigma"], 6), "loglik": round(m["loglik"], 4), "k": m["k"]}

    fitted_at = now_iso()
    model = {
        "provisional": False, "reviewed": reviewed, "version": "fit-" + fitted_at[:16].replace(":", ""),
        "fitted_at": fitted_at, "data": data_block,
        "models": dict({m: rnd_model(fits[m]) for m in MODELS},
                       **{m: dict({"segs": round_segs(np_full[m]["segs"]), "k": np_full[m]["k"]},
                                  **({"loglik": round(np_full[m]["loglik"], 4), "iters": np_full[m]["iters"]} if m == "NP" else {}))
                          for m in NONPARAM}),
        "selected": selected, "lr_tests": lr, "cells": cells,
        "loo": [({"event_id": eid, "model": selected, "segs": round_segs(p["segs"])} if nonparam_sel else
                 {"event_id": eid, "model": selected, "coef": {k: round(v, 6) for k, v in p["coef"].items()}, "sigma": round(p["sigma"], 6)})
                for eid, p in loo_params[selected].items()],
        "revision": {"prereg": "docs/L2_revision.md", "candidates": list(CANDS), "simplicity": list(SIMPLICITY)},
    }
    if not reviewed:
        model["note"] = "사건 검수 전 적합(자동 연결 사건표)"  # fitted before event review

    n0 = evf["meta"].get("n_before_review")
    n1 = evf["meta"].get("n_after_review")
    ev_plot = []
    for e in used:
        p = {"event_id": e["event_id"], "outcome": e["_kind"], "org": e["org"], "date": (e.get("start_at") or "")[:10]}
        if e["_kind"] == "exact":
            p["t_h"] = round(e["_t"], 4)
        else:
            p["lower_h"] = round(e["_lo"], 4)
            if e["_kind"] == "interval":
                p["upper_h"] = round(e["_hi"], 4)
        ev_plot.append(p)
    mu_all = mu_of(sm, {"night": False, "group": "G1"}) if selected == "M0" else None
    sel_segs = np_full[selected]["segs"] if nonparam_sel else None
    curve = []
    # selected model, overall cell at elapsed 0: for M0 the single cell; otherwise mixture over observed covariates
    for k in range(0, 121):
        t = k / 10.0
        if t == 0:
            s = 1.0
        elif sel_segs is not None:
            s = pw_sf(sel_segs, t)
        elif mu_all is not None:
            s = float(stats.norm.sf((math.log(t) - mu_all) / sm["sigma"]))
        else:
            tg = [e for e in used if e["_kind"] in ("exact", "interval")] or used
            s = float(np.mean([stats.norm.sf((math.log(t) - mu_of(sm, e)) / sm["sigma"]) for e in tg]))
        curve.append({"t_h": round(t, 1), "s": round(s, 6)})

    results = {
        "status": "final", "reviewed": reviewed,
        "review": {"n_before": n0 or 0, "n_after": n1 if n1 is not None else (n0 or 0),
                   "excluded": sum(1 for e in events if e.get("exclude_reason") == "reviewer")},
        "data": data_block, "selected": selected, "lr_tests": lr, "loo": rows,
        "revision": {"prereg": "docs/L2_revision.md", "prereg_commit": PREREG_COMMIT, "candidates": list(CANDS), "simplicity": list(SIMPLICITY),
                     "rule": "LOO mean pinball (q 0.5/0.8/0.9, exact events); within 2% of the best -> simpler"},
        "interval_coverage": {"hit": hit, "miss": miss, "undetermined": und},
        "time_split": {"train_n": len(train), "test_n": len(test), "rows": ts_rows, "split_at": SPLIT_AT},
        "events_plot": ev_plot, "curve": curve,
        "built_at": fitted_at,
    }
    for p, obj in ((args.model_out, model), (args.results_out, results)):
        os.makedirs(os.path.dirname(os.path.abspath(p)), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
    if args.fixture_out:
        write_fixture(args.fixture_out)

    print("fit: n exact=%d interval=%d right=%d excluded=%d reviewed=%s" % (n_exact, n_interval, n_right, n_excluded, reviewed))
    for m in NONPARAM:
        f_ = np_full[m]
        print("  %s k=%d p50=%.3f p80=%.3f p90=%.3f%s" % (m, f_["k"], pw_quantile(f_["segs"], 0.5), pw_quantile(f_["segs"], 0.8), pw_quantile(f_["segs"], 0.9),
                                                       (" iters=%d m=%d loglik=%.3f" % (f_["iters"], f_["m"], f_["loglik"])) if m == "NP" else ""))
    for m in MODELS:
        f_ = fits[m]
        print("  %s loglik=%.3f sigma=%.3f coef=%s" % (m, f_["loglik"], f_["sigma"], {k: round(v, 3) for k, v in f_["coef"].items() if v}))
    for r in lr:
        print("  LR %s vs %s chi2=%.3f df=%d p=%.4f" % (r["model"], r["vs"], r["chi2"], r["df"], r["p"]))
    for r in rows:
        c80 = r.get("cov80")
        print("  LOO %-3s n=%d pinball_mean=%.4f p80_mean=%.3f cov80=%s" % (r["id"], r["n"], r["pinball"]["mean"], r["p80_mean_h"] or 0,
                                                                         "%d/%d [%.2f,%.2f]" % (c80["a"], c80["n"], c80["lo"], c80["hi"]) if c80 else "-"))
    print("  selected=%s interval_coverage hit=%d miss=%d undetermined=%d loo_params=%d (n_exact+n_interval=%d)" % (
        selected, hit, miss, und, len(model["loo"]), n_exact + n_interval))


# ---------------------------------------------------------------- fixture for TS survival.test.ts
def write_fixture(path):
    cases = []
    for mu, sigma in ((0.6419, 0.7344), (0.8, 0.7), (1.2, 1.1)):
        dist = stats.lognorm(s=sigma, scale=math.exp(mu))
        pts = []
        for e in (0.0, 0.5, 2.0, 5.0):
            se = float(dist.sf(e)) if e > 0 else 1.0
            for t in (0.25, 1.0, 2.0, 4.0):
                S = float(dist.sf(e + t)) / se
                # partial expectation E[(T - x)+] by numerical integration of the survival function (independent of closed form)
                G, _ = integrate.quad(lambda u: dist.sf(u), e + t, np.inf, epsabs=1e-13, epsrel=1e-12, limit=400)
                pts.append({"e_h": e, "t_h": t, "S": S, "pe_h": float(G) / se})
            for p in (0.5, 0.8, 0.9):
                q = float(dist.isf((1 - p) * se)) - e
                pts.append({"e_h": e, "p": p, "q_h": q})
        cases.append({"mu": mu, "sigma": sigma, "points": pts})
    # piecewise-uniform cases (E0/NP form): ties, point masses inside, unbounded-tail point mass
    pw_cases = []
    for segs in (fit_e0([0.583, 0.75, 1.417, 1.55, 1.55, 1.9, 2.75, 4.267])["segs"],
                 [[0.0, 0.6, 0.1], [0.75, 0.75, 0.2], [0.9, 1.3, 0.25], [1.9, 1.9, 0.15], [2.0, 3.8, 0.2], [9.089, 9.089, 0.1]]):
        pts = []
        for e in (0.0, 0.5, 2.0, 5.0):
            se = pw_sf(segs, e)
            if se <= 0:
                continue
            for t in (0.25, 1.0, 2.0, 4.0):
                pts.append({"e_h": e, "t_h": t, "S": pw_sf(segs, e + t) / se, "pe_h": pw_partial_exp(segs, e + t) / se})
            for p in (0.5, 0.8, 0.9):
                pts.append({"e_h": e, "p": p, "q_h": pw_cond_quantile(segs, e, p)})
        pw_cases.append({"segs": segs, "points": pts})
    obj = {"note": "scipy 1.16.3 lognorm: S = P(T-e > t | T > e), pe_h = E[(T-e-t)+ | T > e] (quad), q_h = conditional remaining quantile; hours",
           "cases": cases, "pw_cases": pw_cases}
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


# ---------------------------------------------------------------- self test
def selftest():
    rng = np.random.default_rng(20261026)
    n = 2000
    t = np.exp(0.8 + 0.7 * rng.standard_normal(n))
    idx = rng.permutation(n)
    evs = []
    n_int = int(0.2 * n)
    for k, i in enumerate(idx):
        e = {"event_id": "S%d" % i, "night": False, "group": "G1"}
        if k < n_int:
            # independent inspection grid (width 1h, random offset): non-informative interval censoring
            off = rng.uniform(0, 1.0)
            lo = off + math.floor(t[i] - off)
            if lo < 0:
                lo, hi = 0.0, off
            else:
                hi = lo + 1.0
            e.update({"_kind": "interval", "_lo": lo, "_hi": hi})
        elif k < n_int + int(0.5 * n):
            c = math.exp(0.6 + 0.7 * rng.standard_normal())   # independent censoring time
            if c < t[i]:
                e.update({"_kind": "right", "_lo": c})
            else:
                e.update({"_kind": "exact", "_t": float(t[i])})
        else:
            e.update({"_kind": "exact", "_t": float(t[i])})
        evs.append(e)
    d = Data(evs)
    f = fit(d, ["intercept"])
    mu_h, s_h = f["coef"]["intercept"], f["sigma"]
    share_r = float(np.mean(d.kind == "right"))
    share_i = float(np.mean(d.kind == "interval"))
    ok = abs(mu_h - 0.8) < 0.05 and abs(s_h - 0.7) < 0.05
    print("selftest: n=%d right=%.2f interval=%.2f mu_hat=%.4f sigma_hat=%.4f -> %s" % (n, share_r, share_i, mu_h, s_h, "PASS" if ok else "FAIL"))

    # NP (Turnbull) tests, pre-registered in docs/L2_revision.md section 6
    ex_only = Data([e for e in evs if e["_kind"] == "exact"][:300])
    f1 = fit_np(ex_only)
    xs = np.sort(ex_only.t)
    vals, counts = np.unique(xs, return_counts=True)
    got = {a: w for a, b, w in f1["segs"]}
    err1 = max(abs(got.get(v, 0.0) - c / len(xs)) for v, c in zip(vals, counts))
    ok1 = err1 < 1e-9 and all(a == b for a, b, _ in f1["segs"])
    f2 = fit_np(d, track=True)
    true = stats.lognorm(s=0.7, scale=math.exp(0.8))
    err2 = max(abs((1 - pw_sf(f2["segs"], t)) - float(true.cdf(t))) for t in (1.0, 2.0, 3.0, 4.0, 6.0))
    ok2 = err2 < 0.04
    lls = f2["lls"]
    ok3 = all(b >= a - 1e-9 for a, b in zip(lls, lls[1:]))
    print("selftest NP: exact-only max|p-ecdf|=%.2e -> %s; sim sup|F-F0|=%.4f (iters %d, intervals %d) -> %s; EM loglik monotone -> %s" % (
        err1, "PASS" if ok1 else "FAIL", err2, f2["iters"], f2["m"], "PASS" if ok2 else "FAIL", "PASS" if ok3 else "FAIL"))
    # E0 quantiles equal numpy linear quantiles (B1)
    xe = [0.583, 0.75, 1.417, 1.55, 1.55, 1.9, 2.75, 4.267]
    e0 = fit_e0(xe)["segs"]
    err4 = max(abs(pw_quantile(e0, p) - float(np.quantile(xe, p, method="linear"))) for p in (0.1, 0.5, 0.8, 0.9, 0.95))
    ok4 = err4 < 1e-12
    print("selftest E0: max|q - numpy linear|=%.2e -> %s" % (err4, "PASS" if ok4 else "FAIL"))
    return 0 if (ok and ok1 and ok2 and ok3 and ok4) else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--events")
    ap.add_argument("--model-out")
    ap.add_argument("--results-out")
    ap.add_argument("--fixture-out")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        sys.exit(selftest())
    if not (args.events and args.model_out and args.results_out):
        ap.error("--events, --model-out, --results-out are required")
    run(args)


if __name__ == "__main__":
    main()
