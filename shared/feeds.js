/* shared/feeds.js — OrbitTrader quote-source (feed/gateway) config + failover.
 *
 * Pure functions, no globals, no DOM, no Date.now() — every time-dependent
 * function takes `now` (epoch ms) as a parameter so behavior is deterministic
 * and testable in node and the browser.
 *
 * Model:
 *   - Quote/news providers are configured as a priority-ordered list; list
 *     order = priority (first entry = primary source).
 *   - Instant failover: when the active source stops delivering, the next
 *     source in list order takes over automatically.
 *   - A silent source is considered dead after `timeout_sec` seconds
 *     ("datafeeds timeout").
 *   - Gateway flow takes precedence over feed flow: a gateway-provided quote
 *     wins over a feed quote for the same symbol (when gateway_precedence).
 *   - Each symbol carries a main quote source and an optional last/
 *     alternative source (mirrors SYMBOL_SCHEMA_V2 `quote_source` /
 *     `last_source`).
 *   - DOM first-quote rule: the first quote that establishes the order book
 *     comes from the highest-priority active source (constant FIRST_QUOTE_RULE
 *     documents this; selectSource() is the enforcement point).
 *   - Source states: active | failed | disabled | standby.
 */
(function (root) {
"use strict";

var SOURCE_STATES = ["active", "failed", "disabled", "standby"];
var SOURCE_TYPES = ["feed", "gateway"];
var WILDCARD = "*";

/* DOM first-quote rule (documented constant):
 * the first quote that establishes the order book for a symbol must come
 * from the highest-priority active source. */
var FIRST_QUOTE_RULE =
  "dom_first_quote: use selectSource() — first active source in priority order";

function num(v, fb) { v = +v; return isFinite(v) ? v : fb; }

/* Default config: empty source list, 30s silence timeout, gateway precedence. */
function defaultFeedConfig() {
  return { sources: [], timeout_sec: 30, gateway_precedence: true };
}

/* Does a source carry quotes for a symbol?
 * source.symbols = ["*"] (all symbols) or an explicit list. */
function sourceCovers(source, symbol) {
  var syms = source && source.symbols;
  if (!syms || !syms.length) return true; /* absent = all */
  return syms.indexOf(WILDCARD) >= 0 || syms.indexOf(symbol) >= 0;
}

/* A source counts as failed when it is explicitly marked failed, or when it
 * has gone silent longer than timeout_sec (auto-fail on silence). */
function sourceFailed(source, states, now, timeout_sec) {
  var st = states && states[source.id];
  if (st && st.state === "failed") return true;
  if (!st || st.last_active_at == null) return false;
  return (now - st.last_active_at) > num(timeout_sec, 30) * 1000;
}

/* Priority order: list order, with gateways ahead of feeds when
 * gateway_precedence is set. Stable within each group. */
function orderedSources(config) {
  var list = (config.sources || []).slice();
  if (!config.gateway_precedence) return list;
  var gw = [], fd = [];
  list.forEach(function (s) {
    if (s.type === "gateway") gw.push(s); else fd.push(s);
  });
  return gw.concat(fd);
}

/* Select the quote source for a symbol.
 * Returns the source id, or null when no enabled source covers the symbol.
 * Rules:
 *   1. Only enabled sources that cover the symbol are candidates.
 *   2. Gateways precede feeds (when gateway_precedence), then list order.
 *   3. Failed sources are skipped — unless every candidate has failed, in
 *      which case the highest-priority enabled source is returned as a
 *      last resort (a dead feed beats no feed; callers should flag it).
 */
function selectSource(symbol, config, states, now) {
  config = config || defaultFeedConfig();
  states = states || {};
  var ordered = orderedSources(config);
  var candidates = ordered.filter(function (s) {
    return s && s.id && s.enabled !== false && sourceCovers(s, symbol);
  });
  if (!candidates.length) return null;
  for (var i = 0; i < candidates.length; i++) {
    if (!sourceFailed(candidates[i], states, now, config.timeout_sec)) {
      return candidates[i].id;
    }
  }
  return candidates[0].id; /* all failed: last resort, highest priority */
}

/* Immutable state updates. */
function markFailed(states, sourceId, now) {
  states = states || {};
  var prev = states[sourceId] || {};
  var next = {};
  Object.keys(states).forEach(function (k) { next[k] = states[k]; });
  next[sourceId] = {
    state: "failed",
    last_active_at: prev.last_active_at == null ? null : prev.last_active_at,
    failed_at: now
  };
  return next;
}

function markActive(states, sourceId, now) {
  states = states || {};
  var prev = states[sourceId] || {};
  var next = {};
  Object.keys(states).forEach(function (k) { next[k] = states[k]; });
  next[sourceId] = {
    state: "active",
    last_active_at: now,
    failed_at: prev.failed_at == null ? null : prev.failed_at
  };
  return next;
}

/* Per-symbol main/last source mapping.
 * symbols: array of symbol names (strings) or symbol spec objects with
 *   .symbol (or .name) plus SYMBOL_SCHEMA_V2 .quote_source / .last_source.
 * Returns { symbol: { main: sourceId|null, last: sourceId|null } }.
 * A configured main/last id is honored when that source exists in the
 * config; otherwise main falls back to the highest-priority source covering
 * the symbol, and last falls back to null. */
function symbolSourceMap(symbols, config) {
  config = config || defaultFeedConfig();
  var byId = {};
  (config.sources || []).forEach(function (s) { if (s && s.id) byId[s.id] = s; });
  var out = {};
  (symbols || []).forEach(function (entry) {
    var spec = (entry && typeof entry === "object") ? entry : {};
    var name = (typeof entry === "string") ? entry : (spec.symbol || spec.name || "");
    if (!name) return;
    var cfgMain = spec.quote_source || null;
    var cfgLast = spec.last_source || null;
    var main = (cfgMain && byId[cfgMain]) ? cfgMain : selectSource(name, config, {}, 0);
    /* selectSource with empty states returns the priority-ordered source;
     * with now=0 no auto-fail can trigger on last_active_at anyway. */
    var last = (cfgLast && byId[cfgLast]) ? cfgLast : null;
    out[name] = { main: main, last: last };
  });
  return out;
}

/* Validate a feed config. Returns an array of error strings (empty = valid). */
function validateFeedConfig(config) {
  var errs = [];
  if (!config || typeof config !== "object") return ["config must be an object"];
  var t = num(config.timeout_sec, NaN);
  if (!isFinite(t) || t <= 0) errs.push("timeout_sec must be a positive number");
  var seen = {};
  (config.sources || []).forEach(function (s, i) {
    var tag = "sources[" + i + "]";
    if (!s || typeof s !== "object") { errs.push(tag + ": must be an object"); return; }
    if (!s.id) { errs.push(tag + ": missing id"); }
    else if (seen[s.id]) { errs.push(tag + ": duplicate id '" + s.id + "'"); }
    else { seen[s.id] = true; }
    if (SOURCE_TYPES.indexOf(s.type) < 0) {
      errs.push(tag + ": unknown type '" + s.type + "' (expected feed|gateway)");
    }
  });
  return errs;
}

var Feeds = {
  SOURCE_STATES: SOURCE_STATES,
  SOURCE_TYPES: SOURCE_TYPES,
  FIRST_QUOTE_RULE: FIRST_QUOTE_RULE,
  defaultFeedConfig: defaultFeedConfig,
  sourceCovers: sourceCovers,
  sourceFailed: sourceFailed,
  selectSource: selectSource,
  markFailed: markFailed,
  markActive: markActive,
  symbolSourceMap: symbolSourceMap,
  validateFeedConfig: validateFeedConfig
};
if (typeof module !== "undefined" && module.exports) { module.exports = Feeds; }
else { root.Feeds = Feeds; }
})(typeof globalThis !== "undefined" ? globalThis : this);
