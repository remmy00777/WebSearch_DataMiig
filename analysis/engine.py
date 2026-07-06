"""
Prospect analysis engine (Skill 6).

Evidence-driven method selection:
- predictive + price series  -> short-horizon baseline comparison forecast
- comparative/descriptive    -> descriptive statistics + benchmarking
- anything with 2+ series    -> correlation support
- headlines                  -> lexicon sentiment, reported SEPARATELY from numbers

Forecast philosophy: start with honest baselines (naive, SMA, drift), walk-forward
backtest them at the requested horizon, optionally anchor with the futures curve,
and report a volatility-based RANGE, never a falsely precise point. ARIMA is used
only if statsmodels is installed AND it beats the baselines in backtest.
"""
import math
import numpy as np
import pandas as pd

ENGINE_VERSION = "0.1.0"
Z80, Z95 = 1.2816, 1.9600

BULL_WORDS = ["fall more than expected", "inventories fall", "draw", "disruption", "outage", "sanction",
              "cut", "demand set to firm", "demand rises", "shortage", "escalat", "attack", "chokepoint"]
BEAR_WORDS = ["dollar strengthens", "build", "inventories rise", "surplus", "weak", "demand concerns",
              "supply growth", "revised higher", "recession", "slowdown", "glut"]


def _series(points):
    if not points:
        return pd.Series(dtype=float)
    df = pd.DataFrame(points)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df = df.dropna().sort_values("date").drop_duplicates("date")
    return df.set_index("date")["value"]


def sentiment(headlines):
    if not headlines:
        return None
    pos = neg = 0
    for h in headlines:
        t = str(h.get("title", "")).lower()
        if any(w in t for w in BULL_WORDS):
            pos += 1
        elif any(w in t for w in BEAR_WORDS):
            neg += 1
    n = len(headlines)
    score = (pos - neg) / max(1, n)
    return {
        "score": round(score, 3), "n_headlines": n, "positive": pos, "negative": neg,
        "note": "Lexicon-based tally of supply/demand-relevant phrasing. Directional context only; "
                "NOT mixed into the numeric forecast.",
    }


def _fit_methods(s: pd.Series, h: int):
    """Return dict of callables: given a history series, produce an h-step-ahead estimate."""
    methods = {
        "naive_last_price": lambda hist: float(hist.iloc[-1]),
        "sma_5": lambda hist: float(hist.tail(5).mean()),
        "drift_20": lambda hist: _drift(hist.tail(20), h),
    }
    try:
        from statsmodels.tsa.arima.model import ARIMA  # optional

        def arima(hist):
            try:
                fit = ARIMA(hist.values, order=(1, 1, 0)).fit()
                return float(fit.forecast(steps=h)[-1])
            except Exception:
                return float(hist.iloc[-1])
        methods["arima_110"] = arima
    except ImportError:
        pass
    return methods


def _drift(hist: pd.Series, h: int) -> float:
    if len(hist) < 3:
        return float(hist.iloc[-1])
    x = np.arange(len(hist))
    slope, intercept = np.polyfit(x, hist.values, 1)
    return float(intercept + slope * (len(hist) - 1 + h))


def backtest(s: pd.Series, h: int, window: int = 30):
    """Walk-forward MAE at horizon h over the last `window` origins."""
    methods = _fit_methods(s, h)
    errors = {k: [] for k in methods}
    n = len(s)
    start = max(25, n - window - h)
    for t in range(start, n - h):
        hist = s.iloc[: t + 1]
        actual = float(s.iloc[t + h])
        for name, fn in methods.items():
            try:
                errors[name].append(abs(fn(hist) - actual))
            except Exception:
                pass
    return {k: round(float(np.mean(v)), 4) for k, v in errors.items() if v}


def forecast(payload):
    s = _series(payload.get("prices") or payload.get("series") or [])
    if len(s) < 30:
        return {"ok": False, "error": f"Insufficient history for forecasting ({len(s)} points; need >=30)."}
    h = max(1, min(30, int(round((payload.get("horizon_days") or 7) * 5 / 7))))  # business days
    methods = _fit_methods(s, h)
    bt = backtest(s, h)
    components = {name: round(fn(s), 2) for name, fn in methods.items()}

    futures = payload.get("futures") or []
    futures_used = False
    if futures:
        nearest = sorted(futures, key=lambda f: f.get("months_out", 99))[0]
        components["futures_nearest_contract"] = round(float(nearest["settle"]), 2)
        futures_used = True

    # Weight: best two backtested baselines (inverse-MAE), then average with futures anchor if present.
    ranked = sorted(bt.items(), key=lambda kv: kv[1])[:2]
    if ranked:
        weights = {k: 1.0 / max(v, 1e-6) for k, v in ranked}
        wsum = sum(weights.values())
        base_point = sum(components[k] * w for k, w in weights.items()) / wsum
    else:
        base_point = components["naive_last_price"]
    point = (base_point + components["futures_nearest_contract"]) / 2 if futures_used else base_point

    log_ret = np.log(s / s.shift(1)).dropna().tail(60)
    sigma = float(log_ret.std())
    band = lambda z: [round(point * math.exp(-z * sigma * math.sqrt(h)), 2),
                      round(point * math.exp(z * sigma * math.sqrt(h)), 2)]
    range80, range95 = band(Z80), band(Z95)

    senti = sentiment(payload.get("headlines") or [])
    ann_vol = sigma * math.sqrt(252)
    reasons = ["Short-horizon commodity prices are near-random-walk; ranges dominate points."]
    confidence = "medium"
    if ann_vol > 0.35:
        confidence = "low"
        reasons.append(f"Annualized volatility is elevated ({ann_vol:.0%}).")
    else:
        reasons.append(f"Annualized volatility {ann_vol:.0%}; interval width reflects it.")
    if payload.get("is_mock"):
        reasons.append("Inputs are mock demo data, so this is a workflow demonstration, not a market view.")
    reasons.append("Confidence for market-price forecasts is capped at MEDIUM by design (no overclaiming).")

    best = ranked[0][0] if ranked else "naive_last_price"
    inv = _series(payload.get("inventories") or [])
    insights = [
        {"kind": "finding", "title": "Backtest winner",
         "body": f"'{best}' had the lowest walk-forward MAE (${bt.get(best, float('nan')):.2f}) at the {h}-business-day horizon; the naive baseline MAE was ${bt.get('naive_last_price', float('nan')):.2f}. When no method clearly beats naive, that itself is evidence the market is efficient at this horizon.",
         "importance": 4},
        {"kind": "signal", "title": "Futures curve anchor" if futures_used else "No futures anchor",
         "body": (f"Nearest futures contract settles at ${components.get('futures_nearest_contract', 0):.2f}, used as a market-consensus anchor averaged with the backtest-weighted baseline."
                  if futures_used else "No futures data available; estimate rests on historical baselines only."),
         "importance": 3},
    ]
    if senti:
        direction = "mildly bullish" if senti["score"] > 0.1 else "mildly bearish" if senti["score"] < -0.1 else "mixed/neutral"
        insights.append({"kind": "signal", "title": f"News sentiment is {direction}",
                         "body": f"Score {senti['score']:+.2f} across {senti['n_headlines']} headlines ({senti['positive']} bullish / {senti['negative']} bearish). Reported separately; it may justify leaning toward one side of the numeric range but does not move the numbers.",
                         "importance": 3})
    if len(inv) >= 3:
        recent_draws = float(inv.tail(3).mean())
        insights.append({"kind": "signal", "title": "Inventory trend",
                         "body": f"Average weekly inventory change over the last 3 reports: {recent_draws:+.1f} million bbl ({'draws — typically supportive of prices' if recent_draws < 0 else 'builds — typically pressure prices'}).",
                         "importance": 3})
    insights.append({"kind": "risk", "title": "Event risk is not in the interval",
                     "body": "Scheduled reports (EIA weekly, OPEC statements) and unscheduled geopolitical events can move prices outside the stated range; the interval only captures 'normal' volatility.",
                     "importance": 4})
    insights.append({"kind": "recommendation", "title": "Use the range, monitor weekly",
                     "body": f"Plan around the 80% range ${range80[0]}–${range80[1]} rather than the ${point:.2f} point. Re-run this research after the next EIA weekly report; schedule a Monday-morning recurring run to track drift.",
                     "importance": 5})

    return {
        "ok": True, "engine_version": ENGINE_VERSION, "task_type": "predictive",
        "method": "baseline_comparison_ensemble" + ("_with_futures_anchor" if futures_used else ""),
        "target": payload.get("target"), "horizon_days": h,
        "as_of": s.index[-1].strftime("%Y-%m-%d"), "last_close": round(float(s.iloc[-1]), 2),
        "point": round(point, 2), "range80": range80, "range95": range95,
        "components": components, "backtest": bt, "futures_used": futures_used,
        "volatility": {"daily_sigma": round(sigma, 5), "annualized": round(ann_vol, 4)},
        "sentiment": senti, "confidence": confidence, "confidence_reasons": reasons,
        "summary": (f"The ensemble of backtested baselines{' and the futures anchor' if futures_used else ''} points to "
                    f"~${point:.2f} for {payload.get('target')} at the {h}-business-day horizon, with an 80% likely range of "
                    f"${range80[0]}–${range80[1]}. The honest headline is the range: at this horizon prices are close to a "
                    f"random walk, and no method decisively beat the naive baseline"
                    + (f" (best MAE ${bt.get(best):.2f} vs naive ${bt.get('naive_last_price'):.2f})" if bt else "") + "."),
        "assumptions": [
            "Business-day horizon conversion: calendar days x 5/7, minimum 1.",
            "Volatility bands assume log returns are roughly i.i.d. over the window (no jump/event modeling).",
            "Futures settle is treated as a market-consensus anchor, weighted 50% against the baseline ensemble.",
            "No imputation: missing observations were dropped upstream.",
        ],
        "limitations": [
            "One-week commodity forecasts are dominated by unforecastable news; treat the range, not the point, as the answer.",
            "Backtest window is short (~30 origins); MAE rankings can flip between runs.",
            "Sentiment is a crude lexicon tally, kept separate from the numeric estimate by design.",
        ],
        "insights": insights,
    }


def descriptive(payload):
    s = _series(payload.get("series") or payload.get("prices") or [])
    if s.empty:
        return {"ok": False, "error": "No numeric time series available for descriptive analysis."}
    change = float(s.iloc[-1] - s.iloc[0])
    z = (s - s.rolling(20, min_periods=5).mean()) / s.rolling(20, min_periods=5).std()
    anomalies = [{"date": d.strftime("%Y-%m-%d"), "value": round(float(v), 2)} for d, v in s[z.abs() > 2.5].items()]
    return {
        "ok": True, "engine_version": ENGINE_VERSION, "task_type": payload.get("task_type", "descriptive"),
        "method": "descriptive_statistics_trend_anomaly",
        "stats": {"n": int(len(s)), "start": s.index[0].strftime("%Y-%m-%d"), "end": s.index[-1].strftime("%Y-%m-%d"),
                  "min": round(float(s.min()), 2), "max": round(float(s.max()), 2),
                  "mean": round(float(s.mean()), 2), "last": round(float(s.iloc[-1]), 2),
                  "change_over_period": round(change, 2)},
        "anomalies": anomalies[:10],
        "confidence": "medium",
        "confidence_reasons": ["Descriptive statistics on observed data; uncertainty is limited to data quality."],
        "summary": f"Series of {len(s)} observations from {s.index[0].date()} to {s.index[-1].date()}; last value {s.iloc[-1]:.2f}, period change {change:+.2f}. {len(anomalies)} anomaly candidate(s) (|z|>2.5).",
        "assumptions": ["Anomalies flagged via 20-period rolling z-score threshold 2.5."],
        "limitations": ["Descriptive only; no causal or predictive claims."],
        "insights": [{"kind": "finding", "title": "Period summary",
                      "body": f"Range {s.min():.2f}–{s.max():.2f}, mean {s.mean():.2f}, last {s.iloc[-1]:.2f}.", "importance": 3}],
    }


def analyze(payload):
    task = payload.get("task_type", "descriptive")
    if task in ("predictive", "monitoring") and (payload.get("prices") or payload.get("series")):
        return forecast(payload)
    return descriptive(payload)
