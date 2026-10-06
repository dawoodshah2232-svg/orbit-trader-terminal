/* shared/swap-engine.js — OrbitTrader end-of-day (EOD) rollover swap engine.
 *
 * Pure functions, no I/O, no feed access. Takes plain objects:
 *   - spec:  swap config for one symbol (swap_type, swap_long/short, ...)
 *   - ctx:   EOD context (rollover date, server config, holidays, FX, ...)
 *   - position: {volume_lots, open_price, direction}
 *
 * Concepts implemented (OrbitTrader's own architecture, own wording):
 *   - Four swap types: "money", "points", "percentage", "reopen".
 *   - Per-weekday rollover multipliers; a configurable "triple day"
 *     (default Wednesday) accrues 3x, weekend days accrue 0.
 *   - Rollover holidays: no swap is charged on the holiday itself;
 *     the rollover day immediately before it accrues at 2x.
 *   - Swap-free accounts: when the server/group config marks the account
 *     swap-free, no swap accrues regardless of symbol config.
 *   - Hierarchy: server-level disabled days cannot be re-enabled by a
 *     symbol's own multiplier map — the server config wins.
 *   - EOD accrual: open positions roll into the next trading day and the
 *     night's charge accumulates in the position's swap field (returned
 *     here as {amount, currency} per position).
 *
 * Date convention: weekday derivation uses UTC. Callers pass the rollover
 * date normalized to the server's timezone (a "YYYY-MM-DD" string is
 * unambiguous; a Date is read in UTC).
 */
(function (root) {
"use strict";

var WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
var WEEKDAY_ALIASES = {
  sun: "sun", sunday: "sun",
  mon: "mon", monday: "mon",
  tue: "tue", tuesday: "tue",
  wed: "wed", wednesday: "wed",
  thu: "thu", thursday: "thu",
  fri: "fri", friday: "fri",
  sat: "sat", saturday: "sat"
};
var SWAP_TYPES = ["points", "money", "percentage", "reopen"];
var DAYS_IN_YEAR = [360, 365, 366];

function num(v, fb) { v = +v; return isFinite(v) ? v : fb; }

/* "wednesday" -> "wed", "TUE" -> "tue", unknown -> null */
function canonWeekday(v) {
  if (v == null) return null;
  return WEEKDAY_ALIASES[String(v).toLowerCase()] || null;
}

/* Date | "YYYY-MM-DD" -> "YYYY-MM-DD" (null when unparseable) */
function dateKey(d) {
  var m;
  if (typeof d === "string") {
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    return m ? (m[1] + "-" + m[2] + "-" + m[3]) : null;
  }
  if (d instanceof Date && !isNaN(+d)) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function addDays(key, n) {
  var d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isDisabledDay(serverCfg, wd) {
  var list = (serverCfg && serverCfg.serverDisabledDays) || [];
  for (var i = 0; i < list.length; i++) {
    if (canonWeekday(list[i]) === wd) return true;
  }
  return false;
}

/* Base per-weekday multiplier from the symbol config, before holiday rules.
 * Explicit map wins; otherwise triple day -> 3, weekend -> 0, else 1. */
function symbolMultiplier(spec, wd) {
  var map = spec.swap_weekday_multipliers;
  if (map && typeof map[wd] === "number") return map[wd];
  var triple = canonWeekday(spec.triple_swap_day != null ? spec.triple_swap_day : "wednesday");
  if (wd === triple) return 3;
  if (wd === "sat" || wd === "sun") return 0;
  return 1;
}

/* weekdayMultiplier(date, spec, serverCfg) -> number.
 * Precedence: swap-free -> 0; server disabled day -> 0; rollover
 * holiday -> 0; day-before-holiday -> 2x the symbol's multiplier;
 * otherwise the symbol's own multiplier (triple day -> 3).
 * serverCfg: {swap_free, serverDisabledDays, holidays:["YYYY-MM-DD",...]} */
function weekdayMultiplier(date, spec, serverCfg) {
  spec = spec || {};
  serverCfg = serverCfg || {};
  if (spec.swap_enabled === false) return 0;
  if (serverCfg.swap_free === true) return 0;
  var key = dateKey(date);
  if (!key) return 0;
  var wd = WEEKDAYS[new Date(key + "T00:00:00Z").getUTCDay()];
  if (isDisabledDay(serverCfg, wd)) return 0;
  var holidays = serverCfg.holidays || [];
  if (holidays.indexOf(key) !== -1) return 0;
  var base = symbolMultiplier(spec, wd);
  if (holidays.indexOf(addDays(key, 1)) !== -1) base = base * 2;
  return base;
}

/* Price of 1 "point" (spec.pip_size) for 1.0 lot, in profit currency.
 * Derived from tick_value (profit-ccy per tick per lot) scaled by the
 * pip/tick ratio; falls back to tick_value when sizes are absent. */
function pointPricePerLot(spec) {
  var tv = num(spec.tick_value, 0);
  var tick = num(spec.tick_size, 0);
  var pip = num(spec.pip_size, 0);
  if (tv === 0) return 0;
  if (tick > 0 && pip > 0) return tv * (pip / tick);
  return tv;
}

/* profit-ccy amount -> deposit-ccy. ctx.fx.profitToDeposit may be a rate
 * (number) or a conversion function amount -> amount. Absent: 1:1. */
function toDeposit(amount, fx) {
  var p2d = fx && fx.profitToDeposit;
  if (typeof p2d === "function") return p2d(amount);
  if (typeof p2d === "number" && isFinite(p2d)) return amount * p2d;
  return amount;
}

function currencyFor(type) {
  return type === "reopen" ? "quote" : "deposit";
}

function contractSize(spec, ctx) {
  return num(spec.contract_size != null ? spec.contract_size : ctx.contract_size, 1);
}

/* reopenPrices(position, close_price, swap_per_lot, direction)
 * -> {close_price, reopen_price}.
 * Models the "reopen" swap type: the position closes at the EOD close
 * price and re-opens at that price shifted by the swap so the charge is
 * absorbed into the new open price. swap_per_lot is in quote-currency
 * price units; negative = the trader pays (buy re-opens lower, sell
 * re-opens higher), positive = the trader is credited. Ticket retained
 * by the caller. */
function reopenPrices(position, close_price, swap_per_lot, direction) {
  var dir = direction != null ? direction : (position && position.direction);
  var adj = dir === "sell" ? -1 : 1;
  var s = num(swap_per_lot, 0);
  var c = num(close_price, 0);
  return { close_price: c, reopen_price: c + adj * s };
}

/* accrueSwap(position, spec, ctx) -> {amount, currency, ...}.
 * position: {volume_lots, open_price, direction: "buy"|"sell"}
 * spec: {swap_type, swap_long, swap_short, swap_enabled,
 *        swap_days_in_year, triple_swap_day, swap_weekday_multipliers,
 *        tick_value, tick_size, pip_size, contract_size, ...}
 * ctx: {date, serverCfg, holidays, fx, min_currency_unit,
 *       price_method: "current"|"open", current_price}
 *
 * Semantics per type:
 *   money      -> rate x lots x multiplier, in deposit currency.
 *                (negative rate = the trader pays.)
 *   points     -> rate (points) x point-price x lots x multiplier, in
 *                profit currency, converted to deposit currency;
 *                results smaller than the minimum currency unit round
 *                to zero.
 *   percentage -> (rate/100) / days_in_year applied to the position
 *                value (price x contract x lots), converted to deposit
 *                currency; price_method selects current or open price.
 *   reopen     -> position closed at EOD and re-opened at close price
 *                +/- swap; returns {close_price, reopen_price,
 *                swap_amount} with currency "quote".
 * The current default behavior ("money") is preserved: swap_long /
 * swap_short are per-lot account-currency amounts x lots x multiplier. */
function accrueSwap(position, spec, ctx) {
  position = position || {};
  spec = spec || {};
  ctx = ctx || {};
  var type = spec.swap_type || "money";

  var serverCfg = {};
  if (ctx.serverCfg) for (var k in ctx.serverCfg) serverCfg[k] = ctx.serverCfg[k];
  if (ctx.holidays != null) serverCfg.holidays = ctx.holidays;

  var m = weekdayMultiplier(ctx.date, spec, serverCfg);
  var dir = position.direction === "sell" ? "sell" : "buy";
  var rate = num(dir === "sell" ? spec.swap_short : spec.swap_long, 0);
  var lots = num(position.volume_lots, 0);
  if (m === 0 || lots === 0 || rate === 0) {
    return { amount: 0, currency: currencyFor(type) };
  }

  if (type === "money") {
    return { amount: rate * lots * m, currency: "deposit" };
  }

  if (type === "points") {
    var amountP = rate * pointPricePerLot(spec) * lots * m;
    var amountD = toDeposit(amountP, ctx.fx);
    var minUnit = ctx.min_currency_unit != null ? num(ctx.min_currency_unit, 0) : 0;
    if (Math.abs(amountD) < minUnit) return { amount: 0, currency: "deposit" };
    return { amount: amountD, currency: "deposit" };
  }

  if (type === "percentage") {
    var days = num(spec.swap_days_in_year, 360);
    if (days <= 0) days = 360;
    var useOpen = ctx.price_method === "open";
    var price = useOpen ? num(position.open_price, 0)
                        : num(ctx.current_price != null ? ctx.current_price : position.open_price, 0);
    var value = price * contractSize(spec, ctx) * lots; // in quote/profit currency
    var perDay = (rate / 100) / days;
    return { amount: toDeposit(perDay * value * m, ctx.fx), currency: "deposit" };
  }

  if (type === "reopen") {
    var shift = rate * m; // quote-currency price shift per lot
    var closePx = num(ctx.current_price != null ? ctx.current_price : position.open_price, 0);
    var rp = reopenPrices(position, closePx, shift, dir);
    return {
      amount: shift * lots,
      currency: "quote",
      close_price: rp.close_price,
      reopen_price: rp.reopen_price
    };
  }

  return { amount: 0, currency: "deposit" };
}

/* accrueEOD(positions, specsBySymbol, ctx)
 * -> [{position_id, amount, currency, ...}] for every open position.
 * positions: [{id, symbol, volume_lots, open_price, direction}, ...]
 * Positions with an unknown symbol or invalid spec are included with
 * amount 0 and skipped:true rather than inventing a charge. */
function accrueEOD(positions, specsBySymbol, ctx) {
  positions = positions || [];
  specsBySymbol = specsBySymbol || {};
  return positions.map(function (p) {
    var base = { position_id: p.id };
    var spec = specsBySymbol[p.symbol];
    if (!spec) {
      base.amount = 0; base.currency = "deposit";
      base.skipped = true; base.reason = "unknown-symbol";
      return base;
    }
    var errs = validateSwapSpec(spec);
    if (errs.length) {
      base.amount = 0; base.currency = "deposit";
      base.skipped = true; base.reason = "invalid-spec"; base.errors = errs;
      return base;
    }
    var r = accrueSwap(p, spec, ctx);
    for (var k in r) base[k] = r[k];
    return base;
  });
}

/* validateSwapSpec(spec) -> [error strings] (empty = valid). */
function validateSwapSpec(spec) {
  var errs = [];
  spec = spec || {};
  if (spec.swap_type != null && SWAP_TYPES.indexOf(spec.swap_type) === -1) {
    errs.push("swap_type must be one of: " + SWAP_TYPES.join("|"));
  }
  if (spec.swap_enabled != null && typeof spec.swap_enabled !== "boolean") {
    errs.push("swap_enabled must be boolean");
  }
  ["swap_long", "swap_short"].forEach(function (f) {
    if (spec[f] != null && !isFinite(+spec[f])) {
      errs.push(f + " must be a finite number");
    }
  });
  if (spec.swap_days_in_year != null && DAYS_IN_YEAR.indexOf(+spec.swap_days_in_year) === -1) {
    errs.push("swap_days_in_year must be one of: " + DAYS_IN_YEAR.join("|"));
  }
  if (spec.triple_swap_day != null && canonWeekday(spec.triple_swap_day) === null) {
    errs.push("triple_swap_day must be a valid weekday name");
  }
  var map = spec.swap_weekday_multipliers;
  if (map != null) {
    if (typeof map !== "object") {
      errs.push("swap_weekday_multipliers must be an object");
    } else {
      Object.keys(map).forEach(function (wd) {
        if (canonWeekday(wd) === null) {
          errs.push("swap_weekday_multipliers: unknown weekday '" + wd + "'");
        }
        var v = +map[wd];
        if (!isFinite(v) || v < 0) {
          errs.push("swap_weekday_multipliers[" + wd + "] must be a non-negative number");
        }
      });
    }
  }
  if (spec.swap_holidays_auto != null && typeof spec.swap_holidays_auto !== "boolean") {
    errs.push("swap_holidays_auto must be boolean");
  }
  return errs;
}

var SwapEngine = {
  weekdayMultiplier: weekdayMultiplier,
  accrueSwap: accrueSwap,
  accrueEOD: accrueEOD,
  reopenPrices: reopenPrices,
  validateSwapSpec: validateSwapSpec,
  WEEKDAYS: WEEKDAYS
};
if (typeof module !== "undefined" && module.exports) { module.exports = SwapEngine; }
else { root.SwapEngine = SwapEngine; }
})(typeof globalThis !== "undefined" ? globalThis : this);
