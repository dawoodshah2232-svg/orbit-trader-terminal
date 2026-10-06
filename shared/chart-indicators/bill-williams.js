/* shared/chart-indicators/bill-williams.js — OrbitTrader wave-5 chart tools.
 *
 * 6 Bill Williams indicators. Same def/calc contract as trend.js (see that
 * file's header). The Alligator entry shares its math with the trend-catalog
 * entry (it appears in both groups); it carries its own id so catalog lookups
 * stay unambiguous.
 *
 * Formulas are independent reimplementations of standard public-domain
 * technical-analysis mathematics. No vendor text, no vendor branding.
 */
(function (root) {
"use strict";

var C = null, TR = null;
try {
  if (typeof require === "function") {
    C = require("./common.js");
    TR = require("./trend.js");
  }
} catch (e) { /* browser */ }
if (!C && root && root.ChartIndicatorsCommon) C = root.ChartIndicatorsCommon;
if (!TR && root && root.ChartIndicatorsTrend) TR = root.ChartIndicatorsTrend;
if (!C) throw new Error("chart-indicators/bill-williams: common.js (ChartIndicatorsCommon) must be loaded first");
if (!TR) throw new Error("chart-indicators/bill-williams: trend.js (ChartIndicatorsTrend) must be loaded first");

function P(defs, params) { return C.resolveParams(defs, params, "params"); }

var AL_PARAMS = TR._AL_PARAMS;

/* ---------- Alligator (Bill Williams entry) ---------- */
function calcAlligatorBW(series, params) {
  return TR._calcAlligator(series, params);
}

/* ---------- Gator Oscillator ----------
 * Upper histogram: |jaw - teeth| (>= 0); lower histogram: -|teeth - lips| (<= 0). */
function calcGator(series, params) {
  var p = P(AL_PARAMS, params);
  var L = C.alligatorLines(series, p.jaw_period, p.jaw_shift,
                           p.teeth_period, p.teeth_shift,
                           p.lips_period, p.lips_shift);
  var n = series.length, out = C.aligned(n), i;
  for (i = 0; i < n; i++) {
    if (L.jaw[i] != null && L.teeth[i] != null && L.lips[i] != null)
      out[i] = { upper: Math.abs(L.jaw[i] - L.teeth[i]),
                 lower: -Math.abs(L.teeth[i] - L.lips[i]) };
  }
  return out;
}

/* ---------- Fractals ----------
 * Up fractal at bar i: high[i] strictly exceeds the two highs on each side.
 * Down fractal: mirror on lows. Needs two bars of confirmation, so fractals
 * are only defined for 2 <= i <= n-3; other bars hold null. */
function calcFractals(series, params) {
  P([], params);
  var n = series.length, out = C.aligned(n), i;
  for (i = 2; i <= n - 3; i++) {
    var h = series[i].high, l = series[i].low;
    var up = h > series[i - 1].high && h > series[i - 2].high &&
             h > series[i + 1].high && h > series[i + 2].high;
    var dn = l < series[i - 1].low && l < series[i - 2].low &&
             l < series[i + 1].low && l < series[i + 2].low;
    if (up || dn) out[i] = { up: up ? h : null, down: dn ? l : null };
  }
  return out;
}

/* ---------- Awesome Oscillator: SMA(5, median) - SMA(34, median) ---------- */
function calcAO(series, params) {
  P([], params);
  var med = series.map(function (b) { return (b.high + b.low) / 2; });
  var f = C.smaArr(med, 5), s = C.smaArr(med, 34);
  var n = series.length, out = C.aligned(n), i;
  for (i = 0; i < n; i++)
    if (f[i] != null && s[i] != null) out[i] = f[i] - s[i];
  return out;
}

/* ---------- Accelerator Oscillator: AO - SMA(5, AO) ---------- */
function calcAC(series, params) {
  P([], params);
  var ao = calcAO(series, {});
  var n = ao.length, out = C.aligned(n), i, first = -1;
  for (i = 0; i < n; i++) if (ao[i] != null) { first = i; break; }
  if (first < 0) return out;
  var sma = C.smaArr(ao.slice(first), 5);
  for (i = 0; i < sma.length; i++) {
    if (sma[i] != null) out[first + i] = ao[first + i] - sma[i];
  }
  return out;
}

/* ---------- Market Facilitation Index: (high - low) / volume ----------
 * Null on zero-volume bars (division by zero is undefined, not zero). */
function calcBWMFI(series, params) {
  P([], params);
  var n = series.length, out = C.aligned(n), i;
  for (i = 0; i < n; i++) {
    var v = series[i].volume;
    out[i] = v > 0 ? (series[i].high - series[i].low) / v : null;
  }
  return out;
}

var BILL_WILLIAMS = [
  { id: "alligator_bw", name: "Alligator", category: "bill_williams",
    description: "Three shifted smoothed moving averages of the median price (jaw/teeth/lips). Same math as the trend-catalog Alligator.",
    params: AL_PARAMS, outputs: ["jaw", "teeth", "lips"], calc: calcAlligatorBW },
  { id: "gator", name: "Gator Oscillator", category: "bill_williams",
    description: "Convergence/divergence of the Alligator lines: |jaw-teeth| above zero, -|teeth-lips| below.",
    params: AL_PARAMS, outputs: ["upper", "lower"], calc: calcGator },
  { id: "fractals", name: "Fractals", category: "bill_williams",
    description: "Reversal points where a bar's high/low strictly exceeds its two neighbors on each side.",
    params: [], outputs: ["up", "down"], calc: calcFractals },
  { id: "awesome_oscillator", name: "Awesome Oscillator", category: "bill_williams",
    description: "SMA(5) minus SMA(34) of the median price.",
    params: [], outputs: ["ao"], calc: calcAO },
  { id: "accelerator_oscillator", name: "Accelerator Oscillator", category: "bill_williams",
    description: "Awesome Oscillator minus its 5-bar SMA (acceleration of market driving force).",
    params: [], outputs: ["ac"], calc: calcAC },
  { id: "market_facilitation_index", name: "Market Facilitation Index", category: "bill_williams",
    description: "Bar range per unit of volume: (high - low) / volume.",
    params: [], outputs: ["bwmfi"], calc: calcBWMFI }
];

var api = { BILL_WILLIAMS: BILL_WILLIAMS };
if (typeof module !== "undefined" && module.exports) { module.exports = api; }
else { root.ChartIndicatorsBillWilliams = api; }
})(typeof globalThis !== "undefined" ? globalThis : this);
