# -*- coding: utf-8 -*-
"""P11: Open-Meteo archive (reanalysis) snapshot for the 3 scenario events.

Spec: E1 implementation spec section 4-7. ASCII source; Korean strings as \\u escapes.
Usage: python pipeline/weather_snapshot.py --out data/weather
On failure the scenario file is written as JSON null (screen shows: no weather data, factor 1.0 assumed).
"""
import argparse
import datetime as dt
import json
import os
import time
import urllib.parse
import urllib.request

KST = dt.timezone(dt.timedelta(hours=9))
# sc1 Mapo Seogyo-dong (R3 #7 measured coords), sc2 Anseong-si, sc3 Daejeon Yuseong-gu (city/district representative, approx.)
SCENARIOS = {
    "sc1": {"lat": 37.555, "lon": 126.920, "event": "2026-08-14T18:52"},
    "sc2": {"lat": 37.008, "lon": 127.280, "event": "2026-02-05T03:20"},
    "sc3": {"lat": 36.362, "lon": 127.356, "event": "2026-08-18T14:31"},
}
NOTE = "재분석 자료 — 기상청 관측 아님"  # reanalysis, not KMA observation
ATTR = "Open-Meteo.com (CC BY 4.0)"


def fetch(lat, lon, d0, d1):
    q = {
        "latitude": "%.3f" % lat, "longitude": "%.3f" % lon,
        "start_date": d0, "end_date": d1,
        "hourly": "temperature_2m,precipitation,wind_speed_10m",
        "timezone": "Asia/Seoul",
    }
    url = "https://archive-api.open-meteo.com/v1/archive?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8")), url


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    now = dt.datetime.now(KST).strftime("%Y-%m-%dT%H:%M:%S") + "+09:00"
    for sid, sc in SCENARIOS.items():
        ev = dt.datetime.strptime(sc["event"], "%Y-%m-%dT%H:%M")
        d0 = ev.strftime("%Y-%m-%d")
        d1 = (ev + dt.timedelta(days=1)).strftime("%Y-%m-%d")
        h0 = ev.replace(minute=0)
        lo, hi = h0 - dt.timedelta(hours=1), h0 + dt.timedelta(hours=8)
        out = None
        try:
            data, url = fetch(sc["lat"], sc["lon"], d0, d1)
            hr = data["hourly"]
            rows = []
            for t, temp, pr, ws in zip(hr["time"], hr["temperature_2m"], hr["precipitation"], hr["wind_speed_10m"]):
                tt = dt.datetime.strptime(t, "%Y-%m-%dT%H:%M")
                if lo <= tt <= hi:
                    if temp is None or pr is None or ws is None:
                        continue
                    rows.append({
                        "at": tt.strftime("%Y-%m-%dT%H:%M:00") + "+09:00",
                        "temp_c": round(float(temp), 1),
                        "precip_mm": round(float(pr), 2),
                        "wind_ms": round(float(ws) / 3.6, 2),
                    })
            if rows:
                out = {
                    "source": "open-meteo-archive", "attribution": ATTR, "note": NOTE,
                    "fetched_at": now, "lat": sc["lat"], "lon": sc["lon"],
                    "event_at": sc["event"] + ":00+09:00", "request": url,
                    "hourly": rows,
                }
        except Exception as e:  # network or schema failure -> null file
            print("%s: fetch failed (%s)" % (sid, type(e).__name__))
            out = None
        with open(os.path.join(args.out, sid + ".json"), "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        if out:
            mx = max(r["temp_c"] for r in out["hourly"])
            print("%s: %d hours, max temp %.1f C, max wind %.1f m/s, precip sum %.1f mm" % (
                sid, len(out["hourly"]), mx, max(r["wind_ms"] for r in out["hourly"]), sum(r["precip_mm"] for r in out["hourly"])))
        else:
            print("%s: null" % sid)
        time.sleep(1.0)


if __name__ == "__main__":
    main()
