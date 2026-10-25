# -*- coding: utf-8 -*-
"""P1: collect public disaster SMS (keyword: power outage) from safetydata.go.kr.

Spec: E1 implementation spec section 4-1.
Source is ASCII only; Korean literals are written as \\u escapes.
Usage: python pipeline/fetch_sms.py --out data/sms
"""
import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

BASE = "https://www.safetydata.go.kr/disaster-data/disasterNotification"
KEYWORD = "정전"  # outage
UA = "Mozilla/5.0"
KST = dt.timezone(dt.timedelta(hours=9))

# missing-person messages are never stored (privacy)
PII_RE = re.compile("찾습니다|실종|배회|목격|인상착의")
A_RE = re.compile(r"<a[^>]*?tableHover[^>]*?>(.*?)</a>", re.S)
SN_RE = re.compile(r"sn=(\d+)")
DATE_RE = re.compile(r'<td class="cell-date">\s*(.*?)\s*</td>', re.S)
TAG_RE = re.compile(r"<[^>]+>")
ORG_RE = re.compile(r"\[([^\[\]]*)\]\s*$")


def page_url(page, end_date):
    q = {
        "searchStartDttm": "2021-01-01",
        "searchEndDttm": end_date,
        "keyword": KEYWORD,
        "currentPage": str(page),
        "cntPerPage": "300",
        "pageSize": "10",
    }
    return BASE + "?" + urllib.parse.urlencode(q)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", errors="replace")


def clean(s):
    s = TAG_RE.sub("", s)
    s = html.unescape(s)
    return s.strip()


def parse(page_html):
    """Return list of (sn, text, date_str) in row order."""
    rows = []
    tags = [m for m in A_RE.finditer(page_html)]
    dates = [m.group(1).strip() for m in DATE_RE.finditer(page_html)]
    for i, m in enumerate(tags):
        whole = m.group(0)
        sn_m = SN_RE.search(whole)
        if not sn_m:
            continue
        text = clean(m.group(1))
        date_s = dates[i] if i < len(dates) else None
        rows.append((int(sn_m.group(1)), text, date_s))
    return rows, len(tags), len(dates)


def to_iso(date_s):
    # "2026/10/23 18:53:12" -> "2026-10-23T18:53:12+09:00"
    d = dt.datetime.strptime(date_s.strip(), "%Y/%m/%d %H:%M:%S")
    return d.strftime("%Y-%m-%dT%H:%M:%S") + "+09:00"


def org_of(text):
    m = ORG_RE.search(text)
    if not m:
        return None
    o = re.sub(r"\s+", "", m.group(1))
    return o or None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--end", default=None, help="YYYY-MM-DD (default: today KST)")
    ap.add_argument("--max-pages", type=int, default=30)
    args = ap.parse_args()

    now = dt.datetime.now(KST)
    end_date = args.end or now.strftime("%Y-%m-%d")
    os.makedirs(args.out, exist_ok=True)

    seen = {}
    all_sns = set()
    n_raw = 0
    n_pii = 0
    pages = []
    for page in range(1, args.max_pages + 1):
        url = page_url(page, end_date)
        body = fetch(url)
        rows, n_tags, n_dates = parse(body)
        pages.append({"page": page, "rows": len(rows), "tags": n_tags, "dates": n_dates})
        if not rows:
            break
        if n_tags != n_dates:
            print("warning: page %d tags %d != dates %d" % (page, n_tags, n_dates), file=sys.stderr)
        n_new = 0
        for sn, text, date_s in rows:
            n_raw += 1
            if sn in all_sns or date_s is None:
                continue
            all_sns.add(sn)
            n_new += 1
            if PII_RE.search(text):
                n_pii += 1
                continue
            seen[sn] = {"sn": sn, "sent_at": to_iso(date_s), "org": org_of(text), "text": text}
        pages[-1]["new"] = n_new
        if n_new == 0:
            # the site repeats the last page when currentPage runs past the end
            break
        time.sleep(1.0)

    items = sorted(seen.values(), key=lambda r: (r["sent_at"], r["sn"]))
    by_year = {}
    for r in items:
        y = r["sent_at"][:4]
        by_year[y] = by_year.get(y, 0) + 1
    fetched_at = now.strftime("%Y-%m-%dT%H:%M:%S") + "+09:00"
    corpus = {
        "meta": {
            "source": "safetydata.go.kr disasterNotification (keyword outage)",
            "license_note": "public data, Ministry of the Interior and Safety disaster safety data sharing platform",
            "fetched_at": fetched_at,
            "n": len(items),
        },
        "items": items,
    }
    log = {
        "fetched_at": fetched_at,
        "url_template": page_url(1, end_date).replace("currentPage=1", "currentPage={page}"),
        "search_end": end_date,
        "pages": pages,
        "n_raw_rows": n_raw,
        "n_pii_excluded": n_pii,
        "n_unique_listed": len(all_sns),
        "n_unique": len(items),
        "first_sent": items[0]["sent_at"] if items else None,
        "last_sent": items[-1]["sent_at"] if items else None,
        "by_year": by_year,
        "n_org_null": sum(1 for r in items if r["org"] is None),
    }
    with open(os.path.join(args.out, "corpus.json"), "w", encoding="utf-8") as f:
        json.dump(corpus, f, ensure_ascii=False, indent=1)
    with open(os.path.join(args.out, "fetch_log.json"), "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=1)
    print("n_unique=%d n_pii_excluded=%d first=%s last=%s pages=%d" % (
        len(items), n_pii, log["first_sent"], log["last_sent"], len(pages)))


if __name__ == "__main__":
    main()
