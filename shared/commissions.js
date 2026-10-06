/* shared/commissions.js — OrbitTrader commission engine (pure functions).
 *
 * Calculates broker commission charges from a commission *plan* and a *deal*,
 * manages the pre-blocking of standard commissions at order placement, and
 * validates plan configurations. No globals, no DOM, no feed, no I/O —
 * safe in browser and in node.
 *
 * plan = {
 *   type:     "standard" | "agent" | "fee",
 *   charging: "instant" | "daily" | "monthly",
 *   basis:    "volume" | "turnover_money" | "turnover_volume" | "notional" | "profit",
 *   per:      "trade" | "volume",
 *   levels:   [ { min, max, mode, value }, ... ],
 *   filters:  { entry, action, profit, reason }   (optional)
 * }
 * deal = {
 *   volume_lots, turnover, notional, profit,
 *   entry: "in" | "out", action: "buy" | "sell", reason
 * }
 *
 * A level row matches when the deal's basis value lies in [min, max)
 * (max may be null/undefined for "no upper limit"). chargeBase is the
 * value the charge is multiplied against for per:"volume".
 */
(function (root) {
"use strict";

var TYPES    = ["standard", "agent", "fee"];
var CHARGINGS= ["instant", "daily", "monthly"];
var BASES    = ["volume", "turnover_money", "turnover_volume", "notional", "profit"];
var PERS     = ["trade", "volume"];
var MODES    = ["deposit_ccy", "base_ccy", "profit_ccy", "margin_ccy",
                "points", "percent", "specified_ccy", "profit_percent"];
var ENTRIES  = ["in", "out", "all"];
var ACTIONS  = ["buy", "sell"];

function num(v, fb) { v = +v; return isFinite(v) ? v : fb; }

function basisValue(plan, deal) {
  switch (plan.basis) {
    case "volume":          return num(deal.volume_lots, 0);
    case "turnover_money":  return num(deal.turnover, 0);
    case "turnover_volume": return num(deal.turnover_volume != null
                                        ? deal.turnover_volume : deal.volume_lots, 0);
    case "notional":        return num(deal.notional, 0);
    case "profit":          return num(deal.profit, 0);
    default:                return NaN;
  }
}

/* True when the deal passes every filter the plan declares. */
function matchesFilters(plan, deal) {
  var f = plan.filters || {};
  var e = f.entry;
  if (e != null && e !== "all") {
    var list = Array.isArray(e) ? e : [e];
    if (list.indexOf("all") < 0 && list.indexOf(deal.entry) < 0) return false;
  }
  var a = f.action;
  if (a != null) {
    var al = Array.isArray(a) ? a : [a];
    if (al.indexOf(deal.action) < 0) return false;
  }
  if (f.profit != null) {
    var p = num(deal.profit, 0);
    if (f.profit.min != null && p < f.profit.min) return false;
    if (f.profit.max != null && p >= f.profit.max) return false;
  }
  if (f.reason != null) {
    var rl = Array.isArray(f.reason) ? f.reason : [f.reason];
    if (rl.indexOf(deal.reason) < 0) return false;
  }
  return true;
}

function findLevel(plan, value) {
  var levels = plan.levels || [];
  for (var i = 0; i < levels.length; i++) {
    var lv = levels[i];
    var min = num(lv.min, 0);
    var max = lv.max == null ? Infinity : +lv.max;
    if (value >= min && value < max) return lv;
  }
  return null;
}

/* Charge amount for a matched level. per:"volume" multiplies by deal volume. */
function levelAmount(lv, plan, deal) {
  var v = num(lv.value, 0);
  var mode = lv.mode;
  if (mode === "profit_percent") {
    return v / 100 * num(deal.profit, 0);
  }
  if (mode === "percent") {
    var base;
    switch (plan.basis) {
      case "profit": base = num(deal.profit, 0); break;
      case "notional": base = num(deal.notional, 0); break;
      case "turnover_money": base = num(deal.turnover, 0); break;
      case "turnover_volume": base = num(deal.turnover_volume != null
                                          ? deal.turnover_volume : deal.volume_lots, 0); break;
      default: base = num(deal.volume_lots, 0);
    }
    return v / 100 * base;
  }
  if (plan.per === "volume") return v * num(deal.volume_lots, 0);
  return v;
}

/* calcCommission(plan, deal) -> { amount, currency_mode, type }
 * Filters apply first: a deal that fails them yields 0. A deal that passes
 * but falls outside every level row also yields 0. */
function calcCommission(plan, deal) {
  plan = plan || {};
  deal = deal || {};
  var zero = { amount: 0, currency_mode: null, type: plan.type || null };
  if (!matchesFilters(plan, deal)) return zero;
  var v = basisValue(plan, deal);
  if (!isFinite(v)) return zero;
  var lv = findLevel(plan, v);
  if (!lv) return zero;
  return { amount: levelAmount(lv, plan, deal),
           currency_mode: lv.mode, type: plan.type };
}

/* blockAmount(plan, order) — amount to pre-block when an order is placed.
 * Only standard plans block (including pending orders); agent/fee plans
 * block nothing. Blocked money is excluded from equity / free margin until
 * the order closes or is cancelled. `order` is a deal-shaped object
 * describing the anticipated trade (volume_lots, action, entry, ...). */
function blockAmount(plan, order) {
  plan = plan || {};
  if (plan.type !== "standard") return 0;
  return calcCommission(plan, order || {}).amount;
}

/* releaseBlock(ledger, blockId) — pure bookkeeping: mark a held block as
 * released and return its amount. A missing, already-released, or empty
 * block releases 0. The ledger is a plain object mutated in place:
 *   { blocks: { <id>: { amount, released } } }                       */
function releaseBlock(ledger, blockId) {
  var blocks = ledger && ledger.blocks;
  var b = blocks ? blocks[blockId] : null;
  if (!b || b.released) return 0;
  b.released = true;
  return num(b.amount, 0);
}

/* validatePlan(plan) -> [error strings] (empty = valid). */
function validatePlan(plan) {
  var errors = [];
  if (!plan || typeof plan !== "object") return ["plan must be an object"];
  if (TYPES.indexOf(plan.type) < 0)
    errors.push("type must be one of: " + TYPES.join(", "));
  if (CHARGINGS.indexOf(plan.charging) < 0)
    errors.push("charging must be one of: " + CHARGINGS.join(", "));
  if (plan.type === "fee" && plan.charging && plan.charging !== "instant")
    errors.push("fee plans must use charging 'instant'");
  if (BASES.indexOf(plan.basis) < 0)
    errors.push("basis must be one of: " + BASES.join(", "));
  if (PERS.indexOf(plan.per) < 0)
    errors.push("per must be one of: " + PERS.join(", "));
  if (!Array.isArray(plan.levels) || plan.levels.length === 0) {
    errors.push("levels must be a non-empty array");
  } else {
    var prevMin = -Infinity;
    for (var i = 0; i < plan.levels.length; i++) {
      var lv = plan.levels[i];
      var tag = "levels[" + i + "]";
      var min = num(lv.min, NaN), max = lv.max == null ? null : num(lv.max, NaN);
      if (!isFinite(min)) errors.push(tag + ".min must be a finite number");
      if (max !== null && !isFinite(max)) errors.push(tag + ".max must be a finite number or null");
      if (max !== null && isFinite(min) && max <= min)
        errors.push(tag + ".max must be greater than min");
      if (isFinite(min) && min < prevMin)
        errors.push(tag + ".min must be >= the previous row's min (levels sorted)");
      if (isFinite(min)) prevMin = Math.max(prevMin, min);
      if (MODES.indexOf(lv.mode) < 0)
        errors.push(tag + ".mode must be one of: " + MODES.join(", "));
      if (!isFinite(num(lv.value, NaN)))
        errors.push(tag + ".value must be a finite number");
    }
  }
  var f = plan.filters || {};
  if (f.entry != null) {
    var el = Array.isArray(f.entry) ? f.entry : [f.entry];
    el.forEach(function (x) {
      if (ENTRIES.indexOf(x) < 0) errors.push("filters.entry: '" + x + "' is not in/out/all");
    });
  }
  if (f.action != null) {
    var al = Array.isArray(f.action) ? f.action : [f.action];
    al.forEach(function (x) {
      if (ACTIONS.indexOf(x) < 0) errors.push("filters.action: '" + x + "' is not buy/sell");
    });
  }
  if (f.profit != null && typeof f.profit !== "object")
    errors.push("filters.profit must be an object {min, max}");
  return errors;
}

var COMM = {
  calcCommission: calcCommission,
  blockAmount: blockAmount,
  releaseBlock: releaseBlock,
  validatePlan: validatePlan
};
if (typeof module !== "undefined" && module.exports) { module.exports = COMM; }
else { root.Commissions = COMM; }
})(typeof globalThis !== "undefined" ? globalThis : this);
