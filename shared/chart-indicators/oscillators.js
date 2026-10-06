/* shared/chart-indicators/oscillators.js — OrbitTrader wave-5 chart tools.
 *
 * 15 oscillators. Same def/calc contract as trend.js (see that file's header).
 * ATR and Standard Deviation are volatility measures grouped here as
 * oscillators; Ultimate Oscillator is the 15th standard documented oscillator.
 *
 * Formulas are independent reimplementations of standard public-domain
 * technical-analysis mathematics. No vendor text, no vendor branding.
 */
(function (root) {
"use strict";

var C = null;
try { if (typeof require === "function") C = require("./common.js"); } catch (e) { /* browser */ }
if (!C && root && root.ChartIndicatorsCommon) C = root.ChartIndicatorsCommon;
if (!C) throw new Error("chart-indicators/oscillators: common.js (ChartIndicatorsCommon) must be loaded first");

function P(defs, params) { return C.resolveParams(defs, params, "params"); }
function closes(series) { return series.map(function (b) { return b.close; }); }
/* Run smaArr on the non-null tail starting at `first` (sparse prefix safe). */
function smaFrom(arr, first, period) {
  var sub = C.smaArr(arr.slice(first), period), out = C.aligned(arr.length), i;
  for (i = 0; i < sub.length; i++) out[first + i] = sub[i];
  return out;
}

/* ---------- RSI (Wilder) ---------- */
var RSI_PARAMS = [C.intParam("period", 14, 1, 100000)];
function calcRSI(series, params) {
  var p = P(RSI_PARAMS, params);
  var c = closes(series), n = c.length, out = C.aligned(n), i;
  if (n <= p.period) return out;
  var ag = 0, al = 0;
  for (i = 1; i <= p.period; i++) {
    var ch = c[i] - c[i - 1];
    ag += ch > 0 ? ch : 0;
    al += ch < 0 ? -ch : 0;
  }
  ag /= p.period; al /= p.period;
  out[p.period] = al === 0 ? (ag === 0 ? 50 : 100) : 100 - 100 / (1 + ag / al);
  for (i = p.period + 1; i < n; i++) {
    var ch2 = c[i] - c[i - 1];
    ag = (ag * (p.period - 1) + (ch2 > 0 ? ch2 : 0)) / p.period;
    al = (al * (p.period - 1) + (ch2 < 0 ? -ch2 : 0)) / p.period;
    out[i] = al === 0 ? (ag === 0 ? 50 : 100) : 100 - 100 / (1 + ag / al);
  }
  return out;
}

/* ---------- Stochastic Oscillator ---------- */
var STO_PARAMS = [
  C.intParam("k_period", 5, 1, 100000),
  C.intParam("d_period", 3, 1, 100000),
  C.intParam("slowing", 3, 1, 100000)
];
function calcStochastic(series, params) {
  var p = P(STO_PARAMS, params);
  var n = series.length, out = C.aligned(n), i;
  var highs = series.map(function (b) { return b.high; });
  var lows = series.map(function (b) { return b.low; });
  var c = closes(series);
  var hh = C.highestArr(highs, p.k_period), ll = C.lowestArr(lows, p.k_period);
  var rawK = C.aligned(n);
  for (i = p.k_period - 1; i < n; i++) {
    var rng = hh[i] - ll[i];
    rawK[i] = rng > 0 ? 100 * (c[i] - ll[i]) / rng : 50;
  }
  var kLine = smaFrom(rawK, p.k_period - 1, p.slowing);
  var kFirst = p.k_period - 1 + p.slowing - 1;
  var dLine = smaFrom(kLine, kFirst, p.d_period);
  for (i = 0; i < n; i++) {
    if (kLine[i] != null && dLine[i] != null)
      out[i] = { k: kLine[i], d: dLine[i] };
  }
  return out;
}

/* ---------- Commodity Channel Index ---------- */
var CCI_PARAMS = [C.intParam("period", 14, 1, 100000)];
function calcCCI(series, params) {
  var p = P(CCI_PARAMS, params);
  var tp = series.map(function (b) { return (b.high + b.low + b.close) / 3; });
  var n = tp.length, out = C.aligned(n), i, j;
  var ma = C.smaArr(tp, p.period);
  for (i = p.period - 1; i < n; i++) {
    var md = 0;
    for (j = 0; j < p.period; j++) md += Math.abs(tp[i - j] - ma[i]);
    md /= p.period;
    out[i] = md > 0 ? (tp[i] - ma[i]) / (0.015 * md) : 0;
  }
  return out;
}

/* ---------- Momentum ---------- */
var MOM_PARAMS = [C.intParam("period", 14, 1, 100000)];
function calcMomentum(series, params) {
  var p = P(MOM_PARAMS, params);
  var c = closes(series), n = c.length, out = C.aligned(n), i;
  for (i = p.period; i < n; i++) out[i] = c[i] - c[i - p.period];
  return out;
}

/* ---------- Williams' Percent Range ---------- */
var WPR_PARAMS = [C.intParam("period", 14, 1, 100000)];
function calcWPR(series, params) {
  var p = P(WPR_PARAMS, params);
  var n = series.length, out = C.aligned(n), i;
  var highs = series.map(function (b) { return b.high; });
  var lows = series.map(function (b) { return b.low; });
  var c = closes(series);
  var hh = C.highestArr(highs, p.period), ll = C.lowestArr(lows, p.period);
  for (i = p.period - 1; i < n; i++) {
    var rng = hh[i] - ll[i];
    out[i] = rng > 0 ? (hh[i] - c[i]) / rng * -100 : -50;
  }
  return out;
}

/* ---------- DeMarker (DeMark) ---------- */
var DEM_PARAMS = [C.intParam("period", 14, 1, 100000)];
function calcDeMarker(series, params) {
  var p = P(DEM_PARAMS, params);
  var n = series.length, out = C.aligned(n), i;
  var dMax = C.aligned(n), dMin = C.aligned(n);
  for (i = 1; i < n; i++) {
    var upH = series[i].high - series[i - 1].high;
    var dnL = series[i - 1].low - series[i].low;
    dMax[i] = upH > 0 ? upH : 0;
    dMin[i] = dnL > 0 ? dnL : 0;
  }
  var sMax = smaFrom(dMax, 1, p.period), sMin = smaFrom(dMin, 1, p.period);
  for (i = 0; i < n; i++) {
    if (sMax[i] != null) {
      var t = sMax[i] + sMin[i];
      out[i] = t > 0 ? 100 * sMax[i] / t : 50;
    }
  }
  return out;
}

/* ---------- Force Index ---------- */
var FI_PARAMS = [C.intParam("period", 13, 1, 100000)];
function calcForceIndex(series, params) {
  var p = P(FI_PARAMS, params);
  var n = series.length, out = C.aligned(n), i;
  var raw = C.aligned(n);
  for (i = 1; i < n; i++)
    raw[i] = series[i].volume * (series[i].close - series[i - 1].close);
  var sub = [];
  for (i = 1; i < n; i++) sub.push(raw[i]);
  var es = C.emaArr(sub, p.period);
  for (i = 0; i < es.length; i++) out[1 + i] = es[i];
  return out;
}

/* ---------- Average True Range (Wilder) ---------- */
var ATR_PARAMS = [C.intParam("period", 14, 1, 100000)];
function trueRanges(series) {
  var n = series.length, tr = C.aligned(n), i;
  for (i = 1; i < n; i++) {
    tr[i] = Math.max(series[i].high - series[i].low,
                     Math.abs(series[i].high - series[i - 1].close),
                     Math.abs(series[i].low - series[i - 1].close));
  }
  return tr;
}
function calcATR(series, params) {
  var p = P(ATR_PARAMS, params);
  var tr = trueRanges(series), n = tr.length, out = C.aligned(n), i;
  var sub = [];
  for (i = 1; i < n; i++) sub.push(tr[i]);
  var s = C.smmaArr(sub, p.period);
  for (i = 0; i < s.length; i++) out[1 + i] = s[i];
  return out;
}

/* ---------- Bears / Bulls Power ---------- */
var POW_PARAMS = [C.intParam("period", 13, 1, 100000)];
function calcBearsPower(series, params) {
  var p = P(POW_PARAMS, params);
  var ema = C.emaArr(closes(series), p.period);
  var n = series.length, out = C.aligned(n), i;
  for (i = 0; i < n; i++)
    if (ema[i] != null) out[i] = series[i].low - ema[i];
  return out;
}
function calcBullsPower(series, params) {
  var p = P(POW_PARAMS, params);
  var ema = C.emaArr(closes(series), p.period);
  var n = series.length, out = C.aligned(n), i;
  for (i = 0; i < n; i++)
    if (ema[i] != null) out[i] = series[i].high - ema[i];
  return out;
}

/* ---------- Chaikin Oscillator ---------- */
var CHAIKIN_PARAMS = [
  C.intParam("fast_period", 3, 1, 100000),
  C.intParam("slow_period", 10, 2, 100000)
];
function calcChaikin(series, params) {
  var p = P(CHAIKIN_PARAMS, params);
  if (p.fast_period >= p.slow_period)
    C.fail("params: fast_period must be < slow_period");
  var adl = C.adlArr(series);
  var ef = C.emaArr(adl, p.fast_period), es = C.emaArr(adl, p.slow_period);
  var n = series.length, out = C.aligned(n), i;
  for (i = 0; i < n; i++)
    if (ef[i] != null && es[i] != null) out[i] = ef[i] - es[i];
  return out;
}

/* ---------- Relative Vigor Index (Ehlers-style, period-generalized) ---------- */
var RVI_PARAMS = [C.intParam("period", 10, 1, 100000)];
function calcRVI(series, params) {
  var p = P(RVI_PARAMS, params);
  var n = series.length, out = C.aligned(n), i;
  var co = [], hl = [];
  for (i = 0; i < n; i++) {
    co.push(series[i].close - series[i].open);
    hl.push(series[i].high - series[i].low);
  }
  var sCo = C.smaArr(co, p.period), sHl = C.smaArr(hl, p.period);
  var rvi = C.aligned(n);
  for (i = 0; i < n; i++) {
    if (sCo[i] != null)
      rvi[i] = sHl[i] > 0 ? sCo[i] / sHl[i] : 0;
  }
  for (i = p.period - 1 + 3; i < n; i++) {
    if (rvi[i] != null && rvi[i - 3] != null)
      out[i] = { rvi: rvi[i],
                 signal: (rvi[i] + 2 * rvi[i - 1] + 2 * rvi[i - 2] + rvi[i - 3]) / 6 };
  }
  return out;
}

/* ---------- TRIX (triple-EMA rate of change) ---------- */
var TRIX_PARAMS = [C.intParam("period", 14, 1, 100000)];
function calcTRIX(series, params) {
  var p = P(TRIX_PARAMS, params);
  var c = closes(series), n = c.length, out = C.aligned(n), i;
  var e1 = C.emaArr(c, p.period);
  var s1 = [];
  for (i = p.period - 1; i < n; i++) s1.push(e1[i]);
  var e2 = C.emaArr(s1, p.period);
  var s2 = [];
  for (i = p.period - 1; i < s1.length; i++) s2.push(e2[i]);
  var e3 = C.emaArr(s2, p.period);
  /* e3[t] sits on s2[t], which sits on original bar t + 2*(period-1). */
  var base = 2 * (p.period - 1);
  for (i = p.period - 1; i < e3.length; i++) {
    var idx = base + i;
    if (e3[i] != null && e3[i - 1] != null && e3[i - 1] !== 0)
      out[idx] = 100 * (e3[i] - e3[i - 1]) / e3[i - 1];
  }
  return out;
}

/* ---------- Ultimate Oscillator (Larry Williams) ---------- */
var UO_PARAMS = [
  C.intParam("fast_period", 7, 1, 100000),
  C.intParam("middle_period", 14, 1, 100000),
  C.intParam("slow_period", 28, 1, 100000)
];
function calcUltimateOscillator(series, params) {
  var p = P(UO_PARAMS, params);
  var n = series.length, out = C.aligned(n), i, j;
  var bp = C.aligned(n), tr = C.aligned(n);
  for (i = 1; i < n; i++) {
    var pc = series[i - 1].close;
    bp[i] = series[i].close - Math.min(series[i].low, pc);
    tr[i] = Math.max(series[i].high, pc) - Math.min(series[i].low, pc);
  }
  function avgRatio(len) {
    var a = C.aligned(n);
    for (i = len; i < n; i++) {
      var sb = 0, st = 0;
      for (j = 0; j < len; j++) { sb += bp[i - j]; st += tr[i - j]; }
      a[i] = st > 0 ? sb / st : 0;
    }
    return a;
  }
  var aF = avgRatio(p.fast_period), aM = avgRatio(p.middle_period),
      aS = avgRatio(p.slow_period);
  var wsum = 4 + 2 + 1;
  for (i = p.slow_period; i < n; i++)
    out[i] = 100 * (4 * aF[i] + 2 * aM[i] + aS[i]) / wsum;
  return out;
}

/* ---------- Standard Deviation ---------- */
var STD_PARAMS = [C.intParam("period", 20, 1, 100000), C.priceParam()];
function calcStdDev(series, params) {
  var p = P(STD_PARAMS, params);
  return C.stddevArr(series.map(function (b) { return C.priceOf(b, p.applied_price); }),
                     p.period);
}

var OSCILLATORS = [
  { id: "rsi", name: "Relative Strength Index", category: "oscillator",
    description: "Wilder RSI: 100 - 100/(1+RS) with Wilder-smoothed average gains/losses.",
    params: RSI_PARAMS, outputs: ["rsi"], calc: calcRSI },
  { id: "stochastic", name: "Stochastic Oscillator", category: "oscillator",
    description: "%K = close position inside the N-bar high-low range; %D = SMA of %K.",
    params: STO_PARAMS, outputs: ["k", "d"], calc: calcStochastic },
  { id: "cci", name: "Commodity Channel Index", category: "oscillator",
    description: "Typical-price deviation from its SMA, scaled by mean deviation x 0.015.",
    params: CCI_PARAMS, outputs: ["cci"], calc: calcCCI },
  { id: "momentum", name: "Momentum", category: "oscillator",
    description: "Close minus close N bars ago.",
    params: MOM_PARAMS, outputs: ["momentum"], calc: calcMomentum },
  { id: "wpr", name: "Williams' Percent Range", category: "oscillator",
    description: "Close position inside the N-bar range, on a 0 to -100 scale.",
    params: WPR_PARAMS, outputs: ["wpr"], calc: calcWPR },
  { id: "demarker", name: "DeMarker", category: "oscillator",
    description: "SMA of intrabar highs demand vs lows supply, as a 0-100 ratio.",
    params: DEM_PARAMS, outputs: ["demarker"], calc: calcDeMarker },
  { id: "force_index", name: "Force Index", category: "oscillator",
    description: "EMA of volume-signed close-to-close change.",
    params: FI_PARAMS, outputs: ["force"], calc: calcForceIndex },
  { id: "atr", name: "Average True Range", category: "oscillator",
    description: "Wilder-smoothed true range; a volatility (not direction) measure.",
    params: ATR_PARAMS, outputs: ["atr"], calc: calcATR },
  { id: "bears_power", name: "Bears Power", category: "oscillator",
    description: "Low minus EMA(close): how far sellers pushed below the average.",
    params: POW_PARAMS, outputs: ["bears"], calc: calcBearsPower },
  { id: "bulls_power", name: "Bulls Power", category: "oscillator",
    description: "High minus EMA(close): how far buyers pushed above the average.",
    params: POW_PARAMS, outputs: ["bulls"], calc: calcBullsPower },
  { id: "chaikin", name: "Chaikin Oscillator", category: "oscillator",
    description: "Fast EMA minus slow EMA of the accumulation/distribution line.",
    params: CHAIKIN_PARAMS, outputs: ["chaikin"], calc: calcChaikin },
  { id: "rvi", name: "Relative Vigor Index", category: "oscillator",
    description: "Smoothed (close-open) relative to smoothed (high-low), plus a weighted signal line.",
    params: RVI_PARAMS, outputs: ["rvi", "signal"], calc: calcRVI },
  { id: "trix", name: "TRIX", category: "oscillator",
    description: "Percent rate of change of the triple-smoothed close EMA.",
    params: TRIX_PARAMS, outputs: ["trix"], calc: calcTRIX },
  { id: "ultimate_oscillator", name: "Ultimate Oscillator", category: "oscillator",
    description: "Weighted (4/2/1) buying-pressure ratios over three timeframes.",
    params: UO_PARAMS, outputs: ["uo"], calc: calcUltimateOscillator },
  { id: "stddev", name: "Standard Deviation", category: "oscillator",
    description: "Population standard deviation of the applied price; a volatility measure.",
    params: STD_PARAMS, outputs: ["stddev"], calc: calcStdDev }
];

var api = { OSCILLATORS: OSCILLATORS, _trueRanges: trueRanges };
if (typeof module !== "undefined" && module.exports) { module.exports = api; }
else { root.ChartIndicatorsOscillators = api; }
})(typeof globalThis !== "undefined" ? globalThis : this);
