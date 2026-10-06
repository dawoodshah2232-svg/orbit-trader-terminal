/* shared/chart-indicators/volume.js — OrbitTrader wave-5 chart tools.
 *
 * 4 volume indicators. Same def/calc contract as trend.js (see that file's
 * header). The "Volumes" indicator returns the per-bar volume itself.
 *
 * Formulas are independent reimplementations of standard public-domain
 * technical-analysis mathematics. No vendor text, no vendor branding.
 */
(function (root) {
"use strict";

var C = null;
try { if (typeof require === "function") C = require("./common.js"); } catch (e) { /* browser */ }
if (!C && root && root.ChartIndicatorsCommon) C = root.ChartIndicatorsCommon;
if (!C) throw new Error("chart-indicators/volume: common.js (ChartIndicatorsCommon) must be loaded first");

function P(defs, params) { return C.resolveParams(defs, params, "params"); }

/* ---------- Volumes ---------- */
function calcVolumes(series, params) {
  P([], params);
  return series.map(function (b) { return b.volume; });
}

/* ---------- On Balance Volume ---------- */
function calcOBV(series, params) {
  P([], params);
  var n = series.length, out = C.aligned(n), i, acc = 0;
  for (i = 0; i < n; i++) {
    if (i > 0) {
      if (series[i].close > series[i - 1].close) acc += series[i].volume;
      else if (series[i].close < series[i - 1].close) acc -= series[i].volume;
    } else {
      acc += series[i].volume;
    }
    out[i] = acc;
  }
  return out;
}

/* ---------- Money Flow Index ---------- */
var MFI_PARAMS = [C.intParam("period", 14, 1, 100000)];
function calcMFI(series, params) {
  var p = P(MFI_PARAMS, params);
  var n = series.length, out = C.aligned(n), i;
  if (n <= p.period) return out;
  var tpPrev = (series[0].high + series[0].low + series[0].close) / 3;
  var pos = 0, neg = 0;
  var flows = [];
  for (i = 1; i < n; i++) {
    var tp = (series[i].high + series[i].low + series[i].close) / 3;
    var rmf = tp * series[i].volume;
    var f = { pos: 0, neg: 0 };
    if (tp > tpPrev) f.pos = rmf;
    else if (tp < tpPrev) f.neg = rmf;
    flows.push(f);
    tpPrev = tp;
  }
  for (i = 0; i < p.period; i++) { pos += flows[i].pos; neg += flows[i].neg; }
  out[p.period] = neg === 0 ? (pos === 0 ? 50 : 100) : 100 - 100 / (1 + pos / neg);
  for (i = p.period + 1; i < n; i++) {
    pos += flows[i - 1].pos - flows[i - 1 - p.period].pos;
    neg += flows[i - 1].neg - flows[i - 1 - p.period].neg;
    out[i] = neg === 0 ? (pos === 0 ? 50 : 100) : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

/* ---------- Accumulation/Distribution ---------- */
function calcAD(series, params) {
  P([], params);
  return C.adlArr(series);
}

var VOLUME = [
  { id: "volumes", name: "Volumes", category: "volume",
    description: "Per-bar traded volume, the raw volume series itself.",
    params: [], outputs: ["volume"], calc: calcVolumes },
  { id: "obv", name: "On Balance Volume", category: "volume",
    description: "Cumulative volume signed by close direction (up: +, down: -, flat: 0).",
    params: [], outputs: ["obv"], calc: calcOBV },
  { id: "mfi", name: "Money Flow Index", category: "volume",
    description: "RSI-style 0-100 oscillator on typical-price x volume money flow.",
    params: MFI_PARAMS, outputs: ["mfi"], calc: calcMFI },
  { id: "accumulation_distribution", name: "Accumulation/Distribution", category: "volume",
    description: "Cumulative money-flow-volume: volume weighted by close position in the bar range.",
    params: [], outputs: ["ad"], calc: calcAD }
];

var api = { VOLUME: VOLUME };
if (typeof module !== "undefined" && module.exports) { module.exports = api; }
else { root.ChartIndicatorsVolume = api; }
})(typeof globalThis !== "undefined" ? globalThis : this);
