/* shared/chart-indicators/index.js — OrbitTrader wave-5 chart tools.
 *
 * Assembles the 38-indicator catalog from the per-category modules and
 * validates its integrity at load: exactly 38 definitions, unique ids,
 * category counts (trend 13 / oscillator 15 / volume 4 / bill_williams 6).
 *
 * Entry points: getIndicator(id), calculate(id, series, params),
 * listIndicators(), CATEGORIES, INDICATORS.
 */
(function (root) {
"use strict";

var C = null, TR = null, OS = null, VO = null, BW = null;
try {
  if (typeof require === "function") {
    C = require("./common.js");
    TR = require("./trend.js");
    OS = require("./oscillators.js");
    VO = require("./volume.js");
    BW = require("./bill-williams.js");
  }
} catch (e) { /* browser: fall through to globals */ }
if (!C && root && root.ChartIndicatorsCommon) C = root.ChartIndicatorsCommon;
if (!TR && root && root.ChartIndicatorsTrend) TR = root.ChartIndicatorsTrend;
if (!OS && root && root.ChartIndicatorsOscillators) OS = root.ChartIndicatorsOscillators;
if (!VO && root && root.ChartIndicatorsVolume) VO = root.ChartIndicatorsVolume;
if (!BW && root && root.ChartIndicatorsBillWilliams) BW = root.ChartIndicatorsBillWilliams;
if (!C || !TR || !OS || !VO || !BW)
  throw new Error("chart-indicators: all category modules must be loaded first");

var CATEGORIES = [
  { id: "trend", name: "Trend", count: 13 },
  { id: "oscillator", name: "Oscillators", count: 15 },
  { id: "volume", name: "Volumes", count: 4 },
  { id: "bill_williams", name: "Bill Williams", count: 6 }
];

var INDICATORS = TR.TREND.concat(OS.OSCILLATORS, VO.VOLUME, BW.BILL_WILLIAMS);

/* ---------- catalog integrity checks (fail fast at load) ---------- */
(function validateCatalog() {
  if (INDICATORS.length !== 38)
    C.fail("catalog must hold exactly 38 indicators, found " + INDICATORS.length);
  var seen = {}, counts = {}, i, d;
  for (i = 0; i < INDICATORS.length; i++) {
    d = INDICATORS[i];
    if (!d || typeof d.id !== "string" || !d.id)
      C.fail("catalog entry " + i + " has no id");
    if (seen[d.id]) C.fail("duplicate indicator id '" + d.id + "'");
    seen[d.id] = true;
    if (typeof d.name !== "string" || !d.name)
      C.fail("indicator '" + d.id + "' has no name");
    if (typeof d.calc !== "function")
      C.fail("indicator '" + d.id + "' has no calc function");
    if (!Array.isArray(d.params))
      C.fail("indicator '" + d.id + "' params must be an array");
    if (!Array.isArray(d.outputs) || d.outputs.length === 0)
      C.fail("indicator '" + d.id + "' outputs must be a non-empty array");
    counts[d.category] = (counts[d.category] || 0) + 1;
  }
  for (i = 0; i < CATEGORIES.length; i++) {
    var want = CATEGORIES[i].count, got = counts[CATEGORIES[i].id] || 0;
    if (got !== want)
      C.fail("category '" + CATEGORIES[i].id + "': want " + want +
             " indicators, found " + got);
  }
})();

function getIndicator(id) {
  for (var i = 0; i < INDICATORS.length; i++) {
    if (INDICATORS[i].id === id) return INDICATORS[i];
  }
  C.fail("unknown indicator id '" + id + "'");
}

/* Validated entry point: normalizes the series, then runs the indicator. */
function calculate(id, series, params) {
  var def = getIndicator(id);
  var bars = C.normalizeSeries(series);
  return def.calc(bars, params);
}

/* Catalog listing without the calc functions (safe to serialize). */
function listIndicators() {
  return INDICATORS.map(function (d) {
    return { id: d.id, name: d.name, category: d.category,
             description: d.description, params: d.params,
             outputs: d.outputs.slice() };
  });
}

var api = {
  CATEGORIES: CATEGORIES,
  INDICATORS: INDICATORS,
  getIndicator: getIndicator,
  calculate: calculate,
  listIndicators: listIndicators
};
if (typeof module !== "undefined" && module.exports) { module.exports = api; }
else { root.ChartIndicators = api; }
})(typeof globalThis !== "undefined" ? globalThis : this);
