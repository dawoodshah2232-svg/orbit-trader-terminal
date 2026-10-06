/* shared/chart-indicators/common.js — OrbitTrader wave-5 chart tools.
 *
 * Shared math primitives for the 38-indicator catalog: moving-average
 * builders, Wilder smoothing, rolling highest/lowest, applied-price
 * selection, parameter resolution/validation, and series normalization.
 *
 * All formulas are independent reimplementations of standard public-domain
 * technical-analysis mathematics (textbook definitions). No vendor text,
 * no vendor branding, no broker values.
 */
(function (root) {
"use strict";

var APPLIED_PRICES = ["close", "open", "high", "low", "median", "typical", "weighted"];

function fail(msg) { throw new Error("chart-indicators: " + msg); }
function num(v, fb) { v = +v; return isFinite(v) ? v : fb; }
/* Array of length n pre-filled with null (indicator "not yet defined"). */
function aligned(n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = null; return a; }

/* Price source for moving averages ("applied price"). */
function priceOf(bar, which) {
  switch (which) {
    case "open": return bar.open;
    case "high": return bar.high;
    case "low": return bar.low;
    case "median": return (bar.high + bar.low) / 2;
    case "typical": return (bar.high + bar.low + bar.close) / 3;
    case "weighted": return (bar.high + bar.low + bar.close * 2) / 4;
    default: return bar.close; /* "close" */
  }
}

/* Simple moving average. */
function smaArr(vals, period) {
  var n = vals.length, out = aligned(n), sum = 0, i;
  if (!(period >= 1)) fail("period must be >= 1");
  for (i = 0; i < n; i++) {
    sum += vals[i];
    if (i >= period) sum -= vals[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/* Exponential moving average, seeded with the SMA of the first `period` values. */
function emaArr(vals, period) {
  var n = vals.length, out = aligned(n);
  if (!(period >= 1)) fail("period must be >= 1");
  if (n < period) return out;
  var k = 2 / (period + 1), seed = 0, i;
  for (i = 0; i < period; i++) seed += vals[i];
  seed /= period;
  out[period - 1] = seed;
  for (i = period; i < n; i++) out[i] = out[i - 1] + k * (vals[i] - out[i - 1]);
  return out;
}

/* Smoothed moving average (Wilder smoothing): seed with SMA, then
 * out[i] = (out[i-1] * (period-1) + vals[i]) / period. */
function smmaArr(vals, period) {
  var n = vals.length, out = aligned(n);
  if (!(period >= 1)) fail("period must be >= 1");
  if (n < period) return out;
  var seed = 0, i;
  for (i = 0; i < period; i++) seed += vals[i];
  seed /= period;
  out[period - 1] = seed;
  for (i = period; i < n; i++) out[i] = (out[i - 1] * (period - 1) + vals[i]) / period;
  return out;
}

/* Linear weighted moving average: weights period..1 (most recent heaviest). */
function lwmaArr(vals, period) {
  var n = vals.length, out = aligned(n), wsum = period * (period + 1) / 2, i, j;
  if (!(period >= 1)) fail("period must be >= 1");
  for (i = period - 1; i < n; i++) {
    var s = 0;
    for (j = 0; j < period; j++) s += vals[i - j] * (period - j);
    out[i] = s / wsum;
  }
  return out;
}

/* Population standard deviation over a rolling window. */
function stddevArr(vals, period) {
  var n = vals.length, out = aligned(n), i, j;
  if (!(period >= 1)) fail("period must be >= 1");
  for (i = period - 1; i < n; i++) {
    var mean = 0;
    for (j = 0; j < period; j++) mean += vals[i - j];
    mean /= period;
    var v = 0, d;
    for (j = 0; j < period; j++) { d = vals[i - j] - mean; v += d * d; }
    out[i] = Math.sqrt(v / period);
  }
  return out;
}

function highestArr(vals, period) {
  var n = vals.length, out = aligned(n), i, j;
  if (!(period >= 1)) fail("period must be >= 1");
  for (i = period - 1; i < n; i++) {
    var m = vals[i];
    for (j = 1; j < period; j++) if (vals[i - j] > m) m = vals[i - j];
    out[i] = m;
  }
  return out;
}

function lowestArr(vals, period) {
  var n = vals.length, out = aligned(n), i, j;
  if (!(period >= 1)) fail("period must be >= 1");
  for (i = period - 1; i < n; i++) {
    var m = vals[i];
    for (j = 1; j < period; j++) if (vals[i - j] < m) m = vals[i - j];
    out[i] = m;
  }
  return out;
}

/* Shift a computed line forward by `shift` bars (null-filled head). */
function shiftArr(arr, shift) {
  var n = arr.length, out = aligned(n), i;
  for (i = shift; i < n; i++) out[i] = arr[i - shift];
  return out;
}

/* ---------- parameter definitions & validation ---------- */

function intParam(name, def, min, max) {
  return { name: name, type: "int", default: def, min: min, max: max };
}
function numParam(name, def, min, max) {
  return { name: name, type: "number", default: def, min: min, max: max };
}
function enumParam(name, def, options) {
  return { name: name, type: "enum", default: def, options: options.slice() };
}
function priceParam(def) {
  return { name: "applied_price", type: "price", default: def || "close",
           options: APPLIED_PRICES.slice() };
}

function coerceParam(d, v, where) {
  var label = where + ": param '" + d.name + "'";
  switch (d.type) {
    case "int":
      v = Math.round(+v);
      if (!isFinite(v)) fail(label + " must be an integer");
      break;
    case "number":
      v = +v;
      if (!isFinite(v)) fail(label + " must be a finite number");
      break;
    case "enum":
    case "price":
      if (d.options.indexOf(v) < 0)
        fail(label + " must be one of [" + d.options.join(", ") + "]");
      return v;
    default:
      fail(label + ": unsupported param type '" + d.type + "'");
  }
  if (d.min != null && v < d.min) fail(label + " below minimum " + d.min);
  if (d.max != null && v > d.max) fail(label + " above maximum " + d.max);
  return v;
}

/* Apply defaults, coerce types, enforce min/max; reject unknown keys. */
function resolveParams(defs, params, where) {
  if (params == null) params = {};
  if (typeof params !== "object" || Array.isArray(params))
    fail((where || "params") + " must be an object");
  var out = {}, seen = {}, i, d;
  for (i = 0; i < defs.length; i++) {
    d = defs[i];
    seen[d.name] = true;
    var v = params[d.name];
    if (v == null) v = d.default;
    out[d.name] = coerceParam(d, v, where || "params");
  }
  for (var k in params) {
    if (Object.prototype.hasOwnProperty.call(params, k) && !seen[k])
      fail((where || "params") + ": unknown parameter '" + k + "'");
  }
  return out;
}

/* Validate/normalize an OHLCV series. Volume defaults to 0 when absent;
 * time passes through untouched. Throws on non-finite OHLC. */
function normalizeSeries(series) {
  if (!Array.isArray(series)) fail("series must be an array of bars");
  return series.map(function (b, i) {
    if (!b || typeof b !== "object") fail("bar " + i + " is not an object");
    var o = num(b.open), h = num(b.high), l = num(b.low), c = num(b.close);
    if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c))
      fail("bar " + i + " needs finite open/high/low/close");
    return { time: b.time, open: o, high: h, low: l, close: c,
             volume: num(b.volume, 0) };
  });
}

/* Bill Williams Alligator lines: three shifted smoothed moving averages of
 * the median price. Shared by the trend and Bill Williams catalog entries. */
function alligatorLines(series, jawP, jawS, teethP, teethS, lipsP, lipsS) {
  var med = series.map(function (b) { return (b.high + b.low) / 2; });
  return {
    jaw: shiftArr(smmaArr(med, jawP), jawS),
    teeth: shiftArr(smmaArr(med, teethP), teethS),
    lips: shiftArr(smmaArr(med, lipsP), lipsS)
  };
}

/* Accumulation/distribution line: cumulative money-flow-volume.
 * money-flow multiplier = ((close-low) - (high-close)) / (high-low),
 * guarded to 0 on zero-range bars; each bar adds mfm * volume. */
function adlArr(series) {
  var n = series.length, adl = aligned(n), acc = 0, i;
  for (i = 0; i < n; i++) {
    var h = series[i].high, l = series[i].low, c = series[i].close;
    var mfm = h > l ? ((c - l) - (h - c)) / (h - l) : 0;
    acc += mfm * series[i].volume;
    adl[i] = acc;
  }
  return adl;
}

var api = {
  APPLIED_PRICES: APPLIED_PRICES.slice(),
  fail: fail,
  aligned: aligned,
  priceOf: priceOf,
  smaArr: smaArr,
  emaArr: emaArr,
  smmaArr: smmaArr,
  lwmaArr: lwmaArr,
  stddevArr: stddevArr,
  highestArr: highestArr,
  lowestArr: lowestArr,
  shiftArr: shiftArr,
  intParam: intParam,
  numParam: numParam,
  enumParam: enumParam,
  priceParam: priceParam,
  resolveParams: resolveParams,
  normalizeSeries: normalizeSeries,
  alligatorLines: alligatorLines,
  adlArr: adlArr
};
if (typeof module !== "undefined" && module.exports) { module.exports = api; }
else { root.ChartIndicatorsCommon = api; }
})(typeof globalThis !== "undefined" ? globalThis : this);
