/* shared/chart-indicators/trend.js — OrbitTrader wave-5 chart tools.
 *
 * 13 trend indicators. Each entry: {id, name, category, description, params,
 * outputs, calc}. calc(series, params) is pure: input is an array of
 * normalized bars {open, high, low, close, volume} (see common.normalizeSeries);
 * output is an array of the same length holding null where the value is not
 * yet defined, a number for single-line indicators, or an object of named
 * lines for multi-line indicators.
 *
 * Formulas are independent reimplementations of standard public-domain
 * technical-analysis mathematics. No vendor text, no vendor branding.
 */
(function (root) {
"use strict";

var C = null;
try { if (typeof require === "function") C = require("./common.js"); } catch (e) { /* browser */ }
if (!C && root && root.ChartIndicatorsCommon) C = root.ChartIndicatorsCommon;
if (!C) throw new Error("chart-indicators/trend: common.js (ChartIndicatorsCommon) must be loaded first");

function P(defs, params) { return C.resolveParams(defs, params, "params"); }
function seriesVals(series, which) {
  return series.map(function (b) { return C.priceOf(b, which); });
}

/* ---------- Moving Average (Simple) ---------- */
var SMA_PARAMS = [C.intParam("period", 14, 1, 100000), C.priceParam()];
function calcSMA(series, params) {
  var p = P(SMA_PARAMS, params);
  return C.smaArr(seriesVals(series, p.applied_price), p.period);
}

/* ---------- Moving Average (Exponential) ---------- */
var EMA_PARAMS = [C.intParam("period", 14, 1, 100000), C.priceParam()];
function calcEMA(series, params) {
  var p = P(EMA_PARAMS, params);
  return C.emaArr(seriesVals(series, p.applied_price), p.period);
}

/* ---------- Moving Average (Smoothed / Wilder) ---------- */
var SMMA_PARAMS = [C.intParam("period", 14, 1, 100000), C.priceParam()];
function calcSMMA(series, params) {
  var p = P(SMMA_PARAMS, params);
  return C.smmaArr(seriesVals(series, p.applied_price), p.period);
}

/* ---------- Moving Average (Linear Weighted) ---------- */
var LWMA_PARAMS = [C.intParam("period", 14, 1, 100000), C.priceParam()];
function calcLWMA(series, params) {
  var p = P(LWMA_PARAMS, params);
  return C.lwmaArr(seriesVals(series, p.applied_price), p.period);
}

/* ---------- MACD ---------- */
var MACD_PARAMS = [
  C.intParam("fast_period", 12, 1, 100000),
  C.intParam("slow_period", 26, 2, 100000),
  C.intParam("signal_period", 9, 1, 100000),
  C.priceParam()
];
function macdParts(vals, fast, slow, signal) {
  var ef = C.emaArr(vals, fast), es = C.emaArr(vals, slow), n = vals.length;
  var macd = C.aligned(n), sig = C.aligned(n), i, start = -1;
  for (i = 0; i < n; i++) {
    if (ef[i] != null && es[i] != null) {
      macd[i] = ef[i] - es[i];
      if (start < 0) start = i;
    }
  }
  if (start >= 0) {
    var ssub = C.emaArr(macd.slice(start), signal);
    for (i = 0; i < ssub.length; i++) sig[start + i] = ssub[i];
  }
  return { macd: macd, signal: sig };
}
function calcMACD(series, params) {
  var p = P(MACD_PARAMS, params);
  if (p.fast_period >= p.slow_period)
    C.fail("params: fast_period must be < slow_period");
  var parts = macdParts(seriesVals(series, p.applied_price),
                        p.fast_period, p.slow_period, p.signal_period);
  var n = series.length, out = C.aligned(n), i;
  for (i = 0; i < n; i++) {
    if (parts.macd[i] != null && parts.signal[i] != null) {
      out[i] = { macd: parts.macd[i], signal: parts.signal[i],
                 histogram: parts.macd[i] - parts.signal[i] };
    }
  }
  return out;
}

/* ---------- Average Directional Movement Index ---------- */
var ADX_PARAMS = [C.intParam("period", 14, 1, 100000)];
function calcADX(series, params) {
  var p = P(ADX_PARAMS, params);
  var n = series.length, out = C.aligned(n), i;
  if (n < 2) return out;
  var dmp = [], dmm = [], tr = [];
  for (i = 1; i < n; i++) {
    var up = series[i].high - series[i - 1].high;
    var dn = series[i - 1].low - series[i].low;
    dmp.push(up > dn && up > 0 ? up : 0);
    dmm.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(series[i].high - series[i].low,
                     Math.abs(series[i].high - series[i - 1].close),
                     Math.abs(series[i].low - series[i - 1].close)));
  }
  var sP = C.smmaArr(dmp, p.period),
      sM = C.smmaArr(dmm, p.period),
      sT = C.smmaArr(tr, p.period);
  var dxVals = [];
  for (i = p.period; i < n; i++) {
    var k = i - 1, t = sT[k];
    var pdi = t > 0 ? 100 * sP[k] / t : 0;
    var mdi = t > 0 ? 100 * sM[k] / t : 0;
    var sum = pdi + mdi;
    dxVals.push(sum > 0 ? 100 * Math.abs(pdi - mdi) / sum : 0);
    out[i] = { adx: null, plus_di: pdi, minus_di: mdi };
  }
  var adxS = C.smmaArr(dxVals, p.period);
  for (i = p.period; i < n; i++) {
    var a = adxS[i - p.period];
    if (a != null) out[i].adx = a;
  }
  return out;
}

/* ---------- Bollinger Bands ---------- */
var BB_PARAMS = [
  C.intParam("period", 20, 1, 100000),
  C.numParam("deviation", 2, 0.01, 100),
  C.priceParam()
];
function calcBollinger(series, params) {
  var p = P(BB_PARAMS, params);
  var vals = seriesVals(series, p.applied_price);
  var mid = C.smaArr(vals, p.period), sd = C.stddevArr(vals, p.period);
  var n = series.length, out = C.aligned(n), i;
  for (i = 0; i < n; i++) {
    if (mid[i] != null)
      out[i] = { upper: mid[i] + p.deviation * sd[i],
                 middle: mid[i],
                 lower: mid[i] - p.deviation * sd[i] };
  }
  return out;
}

/* ---------- Envelopes ---------- */
var ENV_PARAMS = [
  C.intParam("period", 14, 1, 100000),
  C.numParam("deviation", 0.1, 0, 100),
  C.priceParam()
];
function calcEnvelopes(series, params) {
  var p = P(ENV_PARAMS, params);
  var ma = C.smaArr(seriesVals(series, p.applied_price), p.period);
  var n = series.length, out = C.aligned(n), i, f = p.deviation / 100;
  for (i = 0; i < n; i++) {
    if (ma[i] != null)
      out[i] = { upper: ma[i] * (1 + f), lower: ma[i] * (1 - f) };
  }
  return out;
}

/* ---------- Parabolic SAR ---------- */
var SAR_PARAMS = [
  C.numParam("step", 0.02, 0.0001, 1),
  C.numParam("maximum", 0.2, 0.001, 1)
];
function calcSAR(series, params) {
  var p = P(SAR_PARAMS, params);
  if (p.step > p.maximum) C.fail("params: step must be <= maximum");
  var n = series.length, out = C.aligned(n), i;
  if (n < 2) return out;
  var up = true, sar = series[0].low, ep = series[0].high, af = p.step;
  for (i = 1; i < n; i++) {
    var h = series[i].high, l = series[i].low;
    sar = sar + af * (ep - sar);
    if (up) {
      sar = i >= 2 ? Math.min(sar, series[i - 1].low, series[i - 2].low)
                   : Math.min(sar, series[i - 1].low);
      if (l < sar) { up = false; sar = ep; ep = l; af = p.step; }
      else if (h > ep) { ep = h; af = Math.min(af + p.step, p.maximum); }
    } else {
      sar = i >= 2 ? Math.max(sar, series[i - 1].high, series[i - 2].high)
                   : Math.max(sar, series[i - 1].high);
      if (h > sar) { up = true; sar = ep; ep = h; af = p.step; }
      else if (l < ep) { ep = l; af = Math.min(af + p.step, p.maximum); }
    }
    out[i] = sar;
  }
  return out;
}

/* ---------- Ichimoku Kinko Hyo ----------
 * Shift convention (pure, array-aligned, no forward plotting):
 *   senkou_a[i] / senkou_b[i] are computed from data kijun bars back
 *   (the values a chart would plot kijun bars ahead);
 *   chikou[i] = close[i + kijun] (the value a chart would plot kijun bars back). */
var ICH_PARAMS = [
  C.intParam("tenkan", 9, 1, 100000),
  C.intParam("kijun", 26, 1, 100000),
  C.intParam("senkou_b_period", 52, 1, 100000)
];
function calcIchimoku(series, params) {
  var p = P(ICH_PARAMS, params);
  var n = series.length, out = C.aligned(n), i;
  var highs = series.map(function (b) { return b.high; });
  var lows = series.map(function (b) { return b.low; });
  var closes = series.map(function (b) { return b.close; });
  var hhT = C.highestArr(highs, p.tenkan), llT = C.lowestArr(lows, p.tenkan);
  var hhK = C.highestArr(highs, p.kijun), llK = C.lowestArr(lows, p.kijun);
  var hhS = C.highestArr(highs, p.senkou_b_period),
      llS = C.lowestArr(lows, p.senkou_b_period);
  for (i = 0; i < n; i++) {
    var tenkan = hhT[i] != null ? (hhT[i] + llT[i]) / 2 : null;
    var kijun = hhK[i] != null ? (hhK[i] + llK[i]) / 2 : null;
    var o = { tenkan: tenkan, kijun: kijun, senkou_a: null,
              senkou_b: null, chikou: null };
    var j = i - p.kijun;
    if (j >= 0 && hhT[j] != null && hhK[j] != null)
      o.senkou_a = ((hhT[j] + llT[j]) / 2 + (hhK[j] + llK[j]) / 2) / 2;
    if (j >= 0 && hhS[j] != null)
      o.senkou_b = (hhS[j] + llS[j]) / 2;
    if (i + p.kijun < n) o.chikou = closes[i + p.kijun];
    if (o.tenkan != null || o.kijun != null || o.senkou_a != null ||
        o.senkou_b != null || o.chikou != null) out[i] = o;
  }
  return out;
}

/* ---------- Alligator (trend entry; same math as the Bill Williams entry) ---------- */
var AL_PARAMS = [
  C.intParam("jaw_period", 13, 1, 100000), C.intParam("jaw_shift", 8, 0, 100000),
  C.intParam("teeth_period", 8, 1, 100000), C.intParam("teeth_shift", 5, 0, 100000),
  C.intParam("lips_period", 5, 1, 100000), C.intParam("lips_shift", 3, 0, 100000)
];
function calcAlligator(series, params) {
  var p = P(AL_PARAMS, params);
  var L = C.alligatorLines(series, p.jaw_period, p.jaw_shift,
                           p.teeth_period, p.teeth_shift,
                           p.lips_period, p.lips_shift);
  var n = series.length, out = C.aligned(n), i;
  for (i = 0; i < n; i++) {
    if (L.jaw[i] != null && L.teeth[i] != null && L.lips[i] != null)
      out[i] = { jaw: L.jaw[i], teeth: L.teeth[i], lips: L.lips[i] };
  }
  return out;
}

/* ---------- Moving Average of Oscillator (OsMA = MACD line minus signal) ---------- */
var OSMA_PARAMS = [
  C.intParam("fast_period", 12, 1, 100000),
  C.intParam("slow_period", 26, 2, 100000),
  C.intParam("signal_period", 9, 1, 100000),
  C.priceParam()
];
function calcOsMA(series, params) {
  var p = P(OSMA_PARAMS, params);
  if (p.fast_period >= p.slow_period)
    C.fail("params: fast_period must be < slow_period");
  var parts = macdParts(seriesVals(series, p.applied_price),
                        p.fast_period, p.slow_period, p.signal_period);
  var n = series.length, out = C.aligned(n), i;
  for (i = 0; i < n; i++) {
    if (parts.macd[i] != null && parts.signal[i] != null)
      out[i] = parts.macd[i] - parts.signal[i];
  }
  return out;
}

/* ---------- VIDYA (Variable Index Dynamic Average, Chande) ----------
 * CMO over cmo_period scales the EMA smoothing factor: in flat markets the
 * average barely moves; in trending markets it tracks like an EMA. */
var VIDYA_PARAMS = [
  C.intParam("cmo_period", 9, 1, 100000),
  C.intParam("ema_period", 12, 1, 100000),
  C.priceParam()
];
function calcVIDYA(series, params) {
  var p = P(VIDYA_PARAMS, params);
  var c = seriesVals(series, p.applied_price);
  var n = c.length, out = C.aligned(n), i;
  if (n < 2) return out;
  var cmo = C.aligned(n), su = 0, sd = 0;
  for (i = 1; i < n; i++) {
    var ch = c[i] - c[i - 1];
    su += ch > 0 ? ch : 0;
    sd += ch < 0 ? -ch : 0;
    if (i > p.cmo_period) {
      var old = c[i - p.cmo_period] - c[i - p.cmo_period - 1];
      su -= old > 0 ? old : 0;
      sd -= old < 0 ? -old : 0;
    }
    if (i >= p.cmo_period) {
      var t = su + sd;
      cmo[i] = t > 0 ? 100 * Math.abs(su - sd) / t : 0;
    }
  }
  var k = 2 / (p.ema_period + 1);
  var start = Math.max(p.ema_period - 1, p.cmo_period);
  if (start < n) {
    var seed = 0;
    for (i = start - p.ema_period + 1; i <= start; i++) seed += c[i];
    out[start] = seed / p.ema_period;
    for (i = start + 1; i < n; i++)
      out[i] = out[i - 1] + k * (cmo[i] / 100) * (c[i] - out[i - 1]);
  }
  return out;
}

var TREND = [
  { id: "sma", name: "Moving Average (Simple)", category: "trend",
    description: "Arithmetic mean of the last N applied prices.",
    params: SMA_PARAMS, outputs: ["sma"], calc: calcSMA },
  { id: "ema", name: "Moving Average (Exponential)", category: "trend",
    description: "Exponentially weighted mean; reacts faster than SMA.",
    params: EMA_PARAMS, outputs: ["ema"], calc: calcEMA },
  { id: "smma", name: "Moving Average (Smoothed)", category: "trend",
    description: "Wilder-smoothed mean; slower and smoother than EMA.",
    params: SMMA_PARAMS, outputs: ["smma"], calc: calcSMMA },
  { id: "lwma", name: "Moving Average (Linear Weighted)", category: "trend",
    description: "Mean weighted linearly by recency (newest bar heaviest).",
    params: LWMA_PARAMS, outputs: ["lwma"], calc: calcLWMA },
  { id: "macd", name: "MACD", category: "trend",
    description: "Fast EMA minus slow EMA, with an EMA signal line and histogram.",
    params: MACD_PARAMS, outputs: ["macd", "signal", "histogram"], calc: calcMACD },
  { id: "adx", name: "Average Directional Movement Index", category: "trend",
    description: "Wilder-smoothed directional movement; ADX gauges trend strength, +/-DI its direction.",
    params: ADX_PARAMS, outputs: ["adx", "plus_di", "minus_di"], calc: calcADX },
  { id: "bollinger", name: "Bollinger Bands", category: "trend",
    description: "SMA middle band with upper/lower bands at +/- deviations of stddev.",
    params: BB_PARAMS, outputs: ["upper", "middle", "lower"], calc: calcBollinger },
  { id: "envelopes", name: "Envelopes", category: "trend",
    description: "SMA shifted up/down by a fixed percentage.",
    params: ENV_PARAMS, outputs: ["upper", "lower"], calc: calcEnvelopes },
  { id: "sar", name: "Parabolic SAR", category: "trend",
    description: "Trailing stop-and-reverse dots; acceleration factor grows while the extreme extends.",
    params: SAR_PARAMS, outputs: ["sar"], calc: calcSAR },
  { id: "ichimoku", name: "Ichimoku Kinko Hyo", category: "trend",
    description: "Tenkan/Kijun mid-range lines, forward-shifted Senkou cloud, lagging Chikou.",
    params: ICH_PARAMS,
    outputs: ["tenkan", "kijun", "senkou_a", "senkou_b", "chikou"],
    calc: calcIchimoku },
  { id: "alligator", name: "Alligator", category: "trend",
    description: "Three shifted smoothed moving averages of the median price (jaw/teeth/lips). Same math as the Bill Williams entry.",
    params: AL_PARAMS, outputs: ["jaw", "teeth", "lips"], calc: calcAlligator },
  { id: "ma_oscillator", name: "Moving Average of Oscillator", category: "trend",
    description: "MACD line minus its signal line (the MACD histogram as a single line).",
    params: OSMA_PARAMS, outputs: ["osma"], calc: calcOsMA },
  { id: "vidya", name: "Variable Index Dynamic Average", category: "trend",
    description: "EMA whose smoothing factor is scaled by the Chande Momentum Oscillator.",
    params: VIDYA_PARAMS, outputs: ["vidya"], calc: calcVIDYA }
];

var api = { TREND: TREND, _calcAlligator: calcAlligator, _AL_PARAMS: AL_PARAMS };
if (typeof module !== "undefined" && module.exports) { module.exports = api; }
else { root.ChartIndicatorsTrend = api; }
})(typeof globalThis !== "undefined" ? globalThis : this);
