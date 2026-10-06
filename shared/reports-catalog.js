/* shared/reports-catalog.js — OrbitTrader standard report catalogue (part 2).
 *
 * Extends the 15 built-in reports in shared/reports.js with 39 further
 * definitions, bringing the manager's standard catalogue to 54. Every name
 * and purpose is written for OrbitTrader (no vendor text). Registration
 * uses the engine's custom-report plugin hook
 * (OrbitReports.registerCustomReport); the built-in ids stay protected.
 *
 * Every generator aggregates only the data it is handed (see docs/REPORTS.md
 * plus the "extras" the manager UI injects: journal, audit, dealerLog,
 * dealerQueue, manualQuotes, groups, specs, feedHealth, ibs,
 * commissionRates, swapFreeGroups, bookRules, sessions, marginLevels,
 * managers). Estimates (commission, swap, revenue, coverage splits) are
 * labeled as estimates in the report purpose — never presented as exact.
 *
 * Pure functions, no DOM. Browser global OrbitReportsCatalog when loaded
 * after shared/reports.js (auto-registers into the default registry);
 * also safe to require() in node for tests.
 */
(function (root) {
"use strict";

var REPORT_CATEGORIES = ["trading", "risk", "execution", "operations", "finance", "regulatory", "growth"];

/* ---- small UTC helpers (module-local, mirrors shared/reports.js) ---- */
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function toDayUTC(ms) {
  var d = new Date(ms);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}
function dayStartUTC(s) { return Date.parse(s + "T00:00:00Z"); }
function dayEndUTC(s) { return dayStartUTC(s) + 86400000; }
function num(v, d) { var n = +v; return isFinite(n) ? n : (d || 0); }
function r2(v) { return Math.round(num(v) * 100) / 100; }
function monthKey(ms) { return toDayUTC(ms).slice(0, 7); }
function inRange(t, from, to) { return t >= dayStartUTC(from) && t < dayEndUTC(to); }
function inList(v, list) { if (!list || !list.length) return true; return list.indexOf(v) !== -1; }
function inLogins(login, p) { return inList(String(login), (p.logins || []).map(String)); }
function inGroups(group, p) { return inList(group, p.groups); }
function inSymbols(symbol, p) { return inList(symbol, p.symbols); }

var TODAY = toDayUTC(Date.now());
var D30 = toDayUTC(Date.now() - 29 * 86400000);

function pFrom() { return { name: "from", type: "date", required: false, default: D30, description: "First day (UTC)." }; }
function pTo() { return { name: "to", type: "date", required: false, default: TODAY, description: "Last day (UTC), inclusive." }; }
function pLogins() { return { name: "logins", type: "string[]", required: false, description: "Limit to these account logins." }; }
function pGroups() { return { name: "groups", type: "string[]", required: false, description: "Limit to these client groups." }; }
function pSymbols() { return { name: "symbols", type: "string[]", required: false, description: "Limit to these symbols." }; }

function dealsIn(p, d) {
  return (d.deals || []).filter(function (x) {
    return inRange(x.closeTime, p.from, p.to) &&
      inLogins(x.login, p) && inGroups(x.group, p) && inSymbols(x.symbol, p);
  });
}
function opsIn(p, d, types) {
  return (d.balanceOps || []).filter(function (x) {
    return inRange(x.time, p.from, p.to) && types.indexOf(x.type) !== -1 &&
      inLogins(x.login, p) && inGroups(x.group, p);
  });
}
function acctName(d, login) {
  var a = (d.accounts || []).filter(function (x) { return String(x.login) === String(login); })[0];
  return a ? (a.name || String(login)) : String(login);
}

/* ================= TRADING ================= */

function genClientPerformance(ctx) {
  var p = ctx.params, d = ctx.data, rows = {};
  dealsIn(p, d).forEach(function (x) {
    var k = String(x.login);
    var a = rows[k] || (rows[k] = { login: k, name: acctName(d, x.login), group: x.group || "",
      deals: 0, wins: 0, losses: 0, volume: 0, gross_profit: 0, gross_loss: 0, commission: 0, swap: 0 });
    a.deals++; a.volume += num(x.volume);
    var pl = num(x.profit);
    if (pl >= 0) { a.wins++; a.gross_profit += pl; } else { a.losses++; a.gross_loss += -pl; }
    a.commission += num(x.commission); a.swap += num(x.swap);
  });
  var out = Object.keys(rows).sort().map(function (k) {
    var a = rows[k];
    var net = a.gross_profit - a.gross_loss - a.commission + a.swap;
    return { login: a.login, name: a.name, group: a.group, deals: a.deals, wins: a.wins,
      losses: a.losses, win_rate_pct: a.deals ? r2(a.wins / a.deals * 100) : 0,
      volume: r2(a.volume), gross_profit: r2(a.gross_profit), gross_loss: r2(a.gross_loss),
      profit_factor: a.gross_loss > 0 ? r2(a.gross_profit / a.gross_loss) : (a.gross_profit > 0 ? 999 : 0),
      expectancy: a.deals ? r2(net / a.deals) : 0, commission: r2(a.commission),
      swap: r2(a.swap), net_pl: r2(net) };
  }).sort(function (a, b) { return b.net_pl - a.net_pl; });
  return { columns: [
    { key: "login", label: "Login" }, { key: "name", label: "Name" }, { key: "group", label: "Group" },
    { key: "deals", label: "Deals" }, { key: "wins", label: "Wins" }, { key: "losses", label: "Losses" },
    { key: "win_rate_pct", label: "Win rate %" }, { key: "volume", label: "Volume" },
    { key: "gross_profit", label: "Gross profit" }, { key: "gross_loss", label: "Gross loss" },
    { key: "profit_factor", label: "Profit factor" }, { key: "expectancy", label: "Expectancy" },
    { key: "commission", label: "Commission" }, { key: "swap", label: "Swap" }, { key: "net_pl", label: "Net P/L" }
  ], rows: out };
}

function genSymbolPerformance(ctx) {
  var p = ctx.params, d = ctx.data, rows = {};
  dealsIn(p, d).forEach(function (x) {
    var a = rows[x.symbol] || (rows[x.symbol] = { symbol: x.symbol, deals: 0, wins: 0, volume: 0,
      gross_profit: 0, gross_loss: 0, commission: 0, spread_revenue: 0 });
    a.deals++; a.volume += num(x.volume);
    var pl = num(x.profit);
    if (pl >= 0) { a.wins++; a.gross_profit += pl; } else a.gross_loss += -pl;
    a.commission += num(x.commission); a.spread_revenue += num(x.spreadRev);
  });
  var out = Object.keys(rows).sort().map(function (s) {
    var a = rows[s];
    return { symbol: s, deals: a.deals, wins: a.wins,
      win_rate_pct: a.deals ? r2(a.wins / a.deals * 100) : 0, volume: r2(a.volume),
      gross_profit: r2(a.gross_profit), gross_loss: r2(a.gross_loss),
      net_pl: r2(a.gross_profit - a.gross_loss), commission: r2(a.commission),
      spread_revenue: r2(a.spread_revenue) };
  }).sort(function (a, b) { return b.volume - a.volume; });
  return { columns: [
    { key: "symbol", label: "Symbol" }, { key: "deals", label: "Deals" }, { key: "wins", label: "Wins" },
    { key: "win_rate_pct", label: "Win rate %" }, { key: "volume", label: "Volume" },
    { key: "gross_profit", label: "Gross profit" }, { key: "gross_loss", label: "Gross loss" },
    { key: "net_pl", label: "Net P/L" }, { key: "commission", label: "Commission" },
    { key: "spread_revenue", label: "Spread revenue" }
  ], rows: out };
}

function genGroupPerformance(ctx) {
  var p = ctx.params, d = ctx.data, rows = {};
  dealsIn(p, d).forEach(function (x) {
    var g = x.group || "(none)";
    var a = rows[g] || (rows[g] = { group: g, accounts: {}, deals: 0, volume: 0, net_pl: 0, commission: 0 });
    a.accounts[String(x.login)] = true; a.deals++;
    a.volume += num(x.volume);
    a.net_pl += num(x.profit) - num(x.commission) + num(x.swap);
    a.commission += num(x.commission);
  });
  var out = Object.keys(rows).sort().map(function (g) {
    var a = rows[g];
    return { group: g, accounts: Object.keys(a.accounts).length, deals: a.deals,
      volume: r2(a.volume), net_pl: r2(a.net_pl), commission: r2(a.commission) };
  });
  return { columns: [
    { key: "group", label: "Group" }, { key: "accounts", label: "Accounts traded" },
    { key: "deals", label: "Deals" }, { key: "volume", label: "Volume" },
    { key: "net_pl", label: "Net P/L" }, { key: "commission", label: "Commission" }
  ], rows: out };
}

function genEquityCurve(ctx) {
  var p = ctx.params, d = ctx.data;
  var byDay = {};
  dealsIn(p, d).forEach(function (x) {
    var k = toDayUTC(x.closeTime) + "|" + String(x.login);
    byDay[k] = (byDay[k] || 0) + num(x.profit) - num(x.commission) + num(x.swap);
  });
  var cum = {};
  var out = Object.keys(byDay).sort().map(function (k) {
    var parts = k.split("|"), day = parts[0], login = parts[1];
    cum[login] = r2((cum[login] || 0) + byDay[k]);
    return { date: day, login: login, name: acctName(d, login),
      day_pl: r2(byDay[k]), cumulative_pl: cum[login] };
  });
  return { columns: [
    { key: "date", label: "Date" }, { key: "login", label: "Login" }, { key: "name", label: "Name" },
    { key: "day_pl", label: "Day P/L" }, { key: "cumulative_pl", label: "Cumulative P/L" }
  ], rows: out };
}

function genOrderActivity(ctx) {
  var p = ctx.params, d = ctx.data;
  var rows = (d.orders || []).filter(function (x) {
    return inLogins(x.login, p) && inGroups(x.group, p) && inSymbols(x.symbol, p);
  }).map(function (x) {
    return { id: x.id, login: String(x.login), name: acctName(d, x.login), symbol: x.symbol,
      side: x.side, volume: num(x.volume), price: x.price != null ? num(x.price) : null,
      state: "open", requested_at: x.requestedAt ? new Date(x.requestedAt).toISOString() : null,
      expiry: x.expiry || null };
  }).sort(function (a, b) { return String(a.id) < String(b.id) ? -1 : 1; });
  return { columns: [
    { key: "id", label: "Order" }, { key: "login", label: "Login" }, { key: "name", label: "Name" },
    { key: "symbol", label: "Symbol" }, { key: "side", label: "Side" }, { key: "volume", label: "Volume" },
    { key: "price", label: "Price" }, { key: "state", label: "State" },
    { key: "requested_at", label: "Requested at" }, { key: "expiry", label: "Expiry" }
  ], rows: rows };
}

function genPositionDetail(ctx) {
  var p = ctx.params, d = ctx.data;
  var ml = d.marginLevels || {};
  var rows = (d.positions || []).filter(function (x) {
    return inLogins(x.login, p) && inGroups(x.group, p) && inSymbols(x.symbol, p);
  }).map(function (x) {
    return { login: String(x.login), name: acctName(d, x.login), group: x.group || "",
      symbol: x.symbol, side: x.side, volume: r2(x.volume),
      open_price: num(x.openPrice), current_price: x.currentPrice != null ? num(x.currentPrice) : null,
      floating_pl: x.floatingPl != null ? r2(x.floatingPl) : null,
      margin_level_pct: ml[String(x.login)] != null ? r2(ml[String(x.login)]) : null };
  }).sort(function (a, b) { return String(a.login) < String(b.login) ? -1 : (a.symbol < b.symbol ? -1 : 1); });
  return { columns: [
    { key: "login", label: "Login" }, { key: "name", label: "Name" }, { key: "group", label: "Group" },
    { key: "symbol", label: "Symbol" }, { key: "side", label: "Side" }, { key: "volume", label: "Volume" },
    { key: "open_price", label: "Open price" }, { key: "current_price", label: "Current price" },
    { key: "floating_pl", label: "Floating P/L" }, { key: "margin_level_pct", label: "Margin level %" }
  ], rows: rows };
}

function genDealingDesk(ctx) {
  var p = ctx.params, d = ctx.data;
  var rows = (d.dealerLog || []).filter(function (x) { return inRange(x.time, p.from, p.to); })
    .map(function (x) {
      return { time: new Date(x.time).toISOString(), dealer: x.by || "", decision: x.decision || "",
        reason: x.reason || "", detail: x.detail || "" };
    }).sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  return { columns: [
    { key: "time", label: "Time (UTC)" }, { key: "dealer", label: "Dealer" },
    { key: "decision", label: "Decision" }, { key: "reason", label: "Reason" }, { key: "detail", label: "Detail" }
  ], rows: rows };
}

function genManualQuoteLog(ctx) {
  var p = ctx.params, d = ctx.data;
  var rows = (d.manualQuotes || []).filter(function (x) { return inRange(x.time, p.from, p.to) && inSymbols(x.symbol, p); })
    .map(function (x) {
      return { time: new Date(x.time).toISOString(), dealer: x.by || "", symbol: x.symbol,
        bid: num(x.bid), ask: num(x.ask), volume: x.volume != null ? num(x.volume) : null,
        hold_sec: num(x.holdSec) };
    }).sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  return { columns: [
    { key: "time", label: "Time (UTC)" }, { key: "dealer", label: "Dealer" }, { key: "symbol", label: "Symbol" },
    { key: "bid", label: "Bid" }, { key: "ask", label: "Ask" }, { key: "volume", label: "Volume" },
    { key: "hold_sec", label: "Hold (s)" }
  ], rows: rows };
}

/* ================= RISK ================= */

function genStopoutLog(ctx) {
  var p = ctx.params, d = ctx.data;
  var rows = (d.audit || []).filter(function (x) {
    return inRange(x.time, p.from, p.to) &&
      /stop-?out/i.test((x.action || "") + " " + (x.detail || ""));
  }).map(function (x) {
    return { time: new Date(x.time).toISOString(), actor: x.by || "",
      action: x.action || "", detail: x.detail || "" };
  }).sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  return { columns: [
    { key: "time", label: "Time (UTC)" }, { key: "actor", label: "Actor" },
    { key: "action", label: "Action" }, { key: "detail", label: "Detail" }
  ], rows: rows };
}

function genExposureByAccount(ctx) {
  var p = ctx.params, d = ctx.data, rows = {}, ml = d.marginLevels || {};
  (d.positions || []).filter(function (x) {
    return inLogins(x.login, p) && inGroups(x.group, p) && inSymbols(x.symbol, p);
  }).forEach(function (x) {
    var k = String(x.login);
    var a = rows[k] || (rows[k] = { login: k, name: acctName(d, x.login), group: x.group || "",
      long_lots: 0, short_lots: 0, floating: 0 });
    if (x.side === "buy") a.long_lots += num(x.volume); else a.short_lots += num(x.volume);
    a.floating += num(x.floatingPl);
  });
  var out = Object.keys(rows).sort().map(function (k) {
    var a = rows[k];
    return { login: a.login, name: a.name, group: a.group,
      long_lots: r2(a.long_lots), short_lots: r2(a.short_lots),
      net_lots: r2(a.long_lots - a.short_lots), floating_pl: r2(a.floating),
      margin_level_pct: ml[k] != null ? r2(ml[k]) : null };
  }).sort(function (a, b) { return Math.abs(b.net_lots) - Math.abs(a.net_lots); });
  return { columns: [
    { key: "login", label: "Login" }, { key: "name", label: "Name" }, { key: "group", label: "Group" },
    { key: "long_lots", label: "Long lots" }, { key: "short_lots", label: "Short lots" },
    { key: "net_lots", label: "Net lots" }, { key: "floating_pl", label: "Floating P/L" },
    { key: "margin_level_pct", label: "Margin level %" }
  ], rows: out };
}

function genExposureBySymbol(ctx) {
  var p = ctx.params, d = ctx.data, rows = {}, alerts = d.expAlerts || {};
  (d.positions || []).filter(function (x) {
    return inLogins(x.login, p) && inGroups(x.group, p) && inSymbols(x.symbol, p);
  }).forEach(function (x) {
    var a = rows[x.symbol] || (rows[x.symbol] = { symbol: x.symbol, buy: 0, sell: 0, floating: 0 });
    if (x.side === "buy") a.buy += num(x.volume); else a.sell += num(x.volume);
    a.floating += num(x.floatingPl);
  });
  var out = Object.keys(rows).sort().map(function (s) {
    var a = rows[s];
    return { symbol: s, buy_lots: r2(a.buy), sell_lots: r2(a.sell),
      net_lots: r2(a.buy - a.sell), floating_pl: r2(a.floating),
      alert_threshold_lots: alerts[s] != null ? num(alerts[s]) : null };
  }).sort(function (a, b) { return Math.abs(b.net_lots) - Math.abs(a.net_lots); });
  return { columns: [
    { key: "symbol", label: "Symbol" }, { key: "buy_lots", label: "Buy lots" },
    { key: "sell_lots", label: "Sell lots" }, { key: "net_lots", label: "Net lots" },
    { key: "floating_pl", label: "Floating P/L" }, { key: "alert_threshold_lots", label: "Alert threshold" }
  ], rows: out };
}

/* coverage estimate for a symbol from local book rules (default B-book). */
function coverPctFor(symbol, d) {
  var rules = d.bookRules || [];
  for (var i = 0; i < rules.length; i++) {
    var m = String(rules[i].symbolMask || rules[i].symbol_mask || "*");
    var re = new RegExp("^" + m.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    if (re.test(symbol)) return num(rules[i].coveragePct != null ? rules[i].coveragePct : rules[i].coverage_pct, 0);
  }
  return 0;
}

function genBookFlow(ctx) {
  var p = ctx.params, d = ctx.data, exp = {};
  (d.positions || []).filter(function (x) { return inLogins(x.login, p) && inGroups(x.group, p); })
    .forEach(function (x) {
      var a = exp[x.symbol] || (exp[x.symbol] = { buy: 0, sell: 0 });
      if (x.side === "buy") a.buy += num(x.volume); else a.sell += num(x.volume);
    });
  var out = Object.keys(exp).filter(function (s) { return inSymbols(s, p); }).sort().map(function (s) {
    var a = exp[s], net = a.buy - a.sell, cov = coverPctFor(s, d) / 100;
    return { symbol: s, buy_lots: r2(a.buy), sell_lots: r2(a.sell), net_lots: r2(net),
      coverage_pct: r2(cov * 100), book: cov >= 100 ? "A" : (cov <= 0 ? "B" : "mixed"),
      retained_lots_est: r2(net * (1 - cov)), covered_lots_est: r2(net * cov) };
  }).sort(function (a, b) { return Math.abs(b.net_lots) - Math.abs(a.net_lots); });
  return { columns: [
    { key: "symbol", label: "Symbol" }, { key: "buy_lots", label: "Buy lots" },
    { key: "sell_lots", label: "Sell lots" }, { key: "net_lots", label: "Net lots" },
    { key: "coverage_pct", label: "Coverage %" }, { key: "book", label: "Book" },
    { key: "retained_lots_est", label: "Retained lots (est)" }, { key: "covered_lots_est", label: "Covered lots (est)" }
  ], rows: out };
}

function genRetainedPnl(ctx) {
  var p = ctx.params, d = ctx.data, rows = {};
  dealsIn(p, d).forEach(function (x) {
    var a = rows[x.symbol] || (rows[x.symbol] = { symbol: x.symbol, deals: 0, volume: 0,
      client_pl: 0, commission: 0, spread_revenue: 0, retained_pl: 0 });
    a.deals++; a.volume += num(x.volume);
    var pl = num(x.profit) - num(x.commission) + num(x.swap);
    a.client_pl += pl; a.commission += num(x.commission); a.spread_revenue += num(x.spreadRev);
    var cov = coverPctFor(x.symbol, d) / 100;
    a.retained_pl += -pl * (1 - cov);
  });
  var out = Object.keys(rows).sort().map(function (s) {
    var a = rows[s];
    return { symbol: s, deals: a.deals, volume: r2(a.volume), client_pl: r2(a.client_pl),
      commission: r2(a.commission), spread_revenue: r2(a.spread_revenue),
      desk_pnl_est: r2(a.retained_pl + a.spread_revenue + a.commission) };
  }).sort(function (a, b) { return b.desk_pnl_est - a.desk_pnl_est; });
  return { columns: [
    { key: "symbol", label: "Symbol" }, { key: "deals", label: "Deals" }, { key: "volume", label: "Volume" },
    { key: "client_pl", label: "Client P/L" }, { key: "commission", label: "Commission" },
    { key: "spread_revenue", label: "Spread revenue" }, { key: "desk_pnl_est", label: "Desk P/L (est)" }
  ], rows: out };
}

function genHedgeRatio(ctx) {
  var p = ctx.params, d = ctx.data, exp = {};
  (d.positions || []).filter(function (x) { return inLogins(x.login, p) && inGroups(x.group, p); })
    .forEach(function (x) {
      var a = exp[x.symbol] || (exp[x.symbol] = { buy: 0, sell: 0 });
      if (x.side === "buy") a.buy += num(x.volume); else a.sell += num(x.volume);
    });
  var out = Object.keys(exp).filter(function (s) { return inSymbols(s, p); }).sort().map(function (s) {
    var a = exp[s], net = a.buy - a.sell, covPct = coverPctFor(s, d);
    var ratio = (a.buy + a.sell) > 0 ? r2(Math.min(a.buy, a.sell) / (a.buy + a.sell) * 100) : 0;
    return { symbol: s, buy_lots: r2(a.buy), sell_lots: r2(a.sell), net_lots: r2(net),
      hedge_ratio_pct: ratio, coverage_pct: r2(covPct),
      status: covPct >= 100 ? "fully covered" : (covPct > 0 ? "partially covered" : "retained") };
  });
  return { columns: [
    { key: "symbol", label: "Symbol" }, { key: "buy_lots", label: "Buy lots" },
    { key: "sell_lots", label: "Sell lots" }, { key: "net_lots", label: "Net lots" },
    { key: "hedge_ratio_pct", label: "Hedge ratio %" }, { key: "coverage_pct", label: "Coverage %" },
    { key: "status", label: "Status" }
  ], rows: out };
}

function genDrawdown(ctx) {
  var p = ctx.params, d = ctx.data;
  var deals = dealsIn(p, d).slice().sort(function (a, b) { return a.closeTime - b.closeTime; });
  var eq = {}, peak = {}, maxdd = {}, maxddDay = {};
  deals.forEach(function (x) {
    var k = String(x.login);
    eq[k] = (eq[k] || 0) + num(x.profit) - num(x.commission) + num(x.swap);
    peak[k] = Math.max(peak[k] || 0, eq[k]);
    var dd = peak[k] - eq[k];
    if (dd > (maxdd[k] || 0)) { maxdd[k] = dd; maxddDay[k] = toDayUTC(x.closeTime); }
  });
  var out = Object.keys(eq).sort().map(function (k) {
    return { login: k, name: acctName(d, k), deals: deals.filter(function (x) { return String(x.login) === k; }).length,
      net_pl: r2(eq[k]), max_drawdown: r2(maxdd[k] || 0),
      max_drawdown_day: maxddDay[k] || null,
      recovery_ratio: (maxdd[k] || 0) > 0 ? r2(eq[k] / maxdd[k]) : null };
  }).sort(function (a, b) { return b.max_drawdown - a.max_drawdown; });
  return { columns: [
    { key: "login", label: "Login" }, { key: "name", label: "Name" }, { key: "deals", label: "Deals" },
    { key: "net_pl", label: "Net P/L" }, { key: "max_drawdown", label: "Max drawdown" },
    { key: "max_drawdown_day", label: "Drawdown day" }, { key: "recovery_ratio", label: "Recovery ratio" }
  ], rows: out };
}

/* ================= EXECUTION ================= */

function genRequoteAnalysis(ctx) {
  var p = ctx.params, d = ctx.data, by = {};
  (d.dealerLog || []).filter(function (x) { return inRange(x.time, p.from, p.to); })
    .forEach(function (x) {
      var dl = x.by || "(unknown)";
      var a = by[dl] || (by[dl] = { dealer: dl, accepted: 0, declined: 0, requoted: 0 });
      var dec = String(x.decision || "").toLowerCase();
      if (dec.indexOf("accept") === 0) a.accepted++;
      else if (dec.indexOf("decline") === 0 || dec.indexOf("reject") === 0) a.declined++;
      else if (dec.indexOf("requote") === 0) a.requoted++;
    });
  var out = Object.keys(by).sort().map(function (k) {
    var a = by[k], tot = a.accepted + a.declined + a.requoted;
    return { dealer: a.dealer, accepted: a.accepted, declined: a.declined, requoted: a.requoted,
      total: tot, requote_rate_pct: tot ? r2(a.requoted / tot * 100) : 0,
      decline_rate_pct: tot ? r2(a.declined / tot * 100) : 0 };
  });
  return { columns: [
    { key: "dealer", label: "Dealer" }, { key: "accepted", label: "Accepted" },
    { key: "declined", label: "Declined" }, { key: "requoted", label: "Requoted" },
    { key: "total", label: "Total" }, { key: "requote_rate_pct", label: "Requote %" },
    { key: "decline_rate_pct", label: "Decline %" }
  ], rows: out };
}

function genRejectionLog(ctx) {
  var p = ctx.params, d = ctx.data;
  var rows = (d.dealerLog || []).filter(function (x) {
    var dec = String(x.decision || "").toLowerCase();
    return inRange(x.time, p.from, p.to) &&
      (dec.indexOf("decline") === 0 || dec.indexOf("reject") === 0);
  }).map(function (x) {
    return { time: new Date(x.time).toISOString(), dealer: x.by || "",
      reason: x.reason || "", detail: x.detail || "" };
  }).sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  return { columns: [
    { key: "time", label: "Time (UTC)" }, { key: "dealer", label: "Dealer" },
    { key: "reason", label: "Reason" }, { key: "detail", label: "Detail" }
  ], rows: rows };
}

function genDealerResponse(ctx) {
  var p = ctx.params, d = ctx.data, now = Date.now();
  var rows = (d.dealerQueue || []).filter(function (x) { return inLogins(x.login, p) && inSymbols(x.symbol, p); })
    .map(function (x) {
      return { ref: x.id, kind: "queued", dealer: "", login: String(x.login), name: acctName(d, x.login),
        symbol: x.symbol, side: x.side, volume: num(x.volume), decision: "pending",
        wait_min: x.ts ? r2((now - x.ts) / 60000) : null, reason: x.why || "" };
    });
  (d.dealerLog || []).filter(function (x) { return inRange(x.time, p.from, p.to); })
    .forEach(function (x) {
      rows.push({ ref: null, kind: "decision", dealer: x.by || "", login: "", name: "",
        symbol: "", side: "", volume: null, decision: x.decision || "",
        wait_min: null, reason: (x.reason || "") + (x.detail ? " · " + x.detail : "") });
    });
  return { columns: [
    { key: "ref", label: "Ref" }, { key: "kind", label: "Kind" }, { key: "dealer", label: "Dealer" },
    { key: "login", label: "Login" }, { key: "name", label: "Name" }, { key: "symbol", label: "Symbol" },
    { key: "side", label: "Side" }, { key: "volume", label: "Volume" }, { key: "decision", label: "Decision" },
    { key: "wait_min", label: "Wait (min)" }, { key: "reason", label: "Reason" }
  ], rows: rows };
}

function genSlippage(ctx) {
  var p = ctx.params, d = ctx.data, rows = {};
  (d.markouts || []).filter(function (x) {
    return inSymbols(x.symbol, p) && x.minutes != null && x.minutes <= 60;
  }).forEach(function (x) {
    var signed = (x.side === "sell" ? -1 : 1) * (num(x.laterPrice) - num(x.execPrice));
    var a = rows[x.symbol] || (rows[x.symbol] = { symbol: x.symbol, fills: 0, sum: 0, worst: 0 });
    a.fills++; a.sum += signed;
    if (Math.abs(signed) > Math.abs(a.worst)) a.worst = signed;
  });
  var out = Object.keys(rows).sort().map(function (s) {
    var a = rows[s];
    return { symbol: s, fills: a.fills, mean_slippage: r2(a.sum / a.fills),
      worst_slippage: r2(a.worst) };
  });
  return { columns: [
    { key: "symbol", label: "Symbol" }, { key: "fills", label: "Fills" },
    { key: "mean_slippage", label: "Mean slippage" }, { key: "worst_slippage", label: "Worst slippage" }
  ], rows: out };
}

function genPendingLifetime(ctx) {
  var p = ctx.params, d = ctx.data, now = Date.now();
  var rows = (d.orders || []).filter(function (x) {
    return inLogins(x.login, p) && inGroups(x.group, p) && inSymbols(x.symbol, p);
  }).map(function (x) {
    return { id: x.id, login: String(x.login), name: acctName(d, x.login), symbol: x.symbol,
      side: x.side, volume: num(x.volume), price: x.price != null ? num(x.price) : null,
      age_hours: x.requestedAt ? r2((now - x.requestedAt) / 3600000) : null,
      expiry: x.expiry || null };
  }).sort(function (a, b) { return (b.age_hours || 0) - (a.age_hours || 0); });
  return { columns: [
    { key: "id", label: "Order" }, { key: "login", label: "Login" }, { key: "name", label: "Name" },
    { key: "symbol", label: "Symbol" }, { key: "side", label: "Side" }, { key: "volume", label: "Volume" },
    { key: "price", label: "Price" }, { key: "age_hours", label: "Age (h)" }, { key: "expiry", label: "Expiry" }
  ], rows: rows };
}

/* ================= OPERATIONS ================= */

function genLoginActivity(ctx) {
  var p = ctx.params, d = ctx.data, rows = [];
  (d.accounts || []).filter(function (x) { return inLogins(x.login, p) && inGroups(x.group, p); })
    .forEach(function (x) {
      (x.sessions || []).forEach(function (s) {
        if (inRange(s.time, p.from, p.to))
          rows.push({ time: new Date(s.time).toISOString(), login: String(x.login),
            name: x.name || String(x.login), ip: s.ip || "", device: s.device || "" });
      });
    });
  rows.sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  return { columns: [
    { key: "time", label: "Time (UTC)" }, { key: "login", label: "Login" }, { key: "name", label: "Name" },
    { key: "ip", label: "IP" }, { key: "device", label: "Device" }
  ], rows: rows };
}

function genSystemEvents(ctx) {
  var p = ctx.params, d = ctx.data;
  var rows = (d.journal || []).filter(function (x) { return inRange(x.time, p.from, p.to); })
    .map(function (x) {
      return { time: new Date(x.time).toISOString(), component: x.comp || "",
        level: x.level || "", message: x.msg || "" };
    }).sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  return { columns: [
    { key: "time", label: "Time (UTC)" }, { key: "component", label: "Component" },
    { key: "level", label: "Level" }, { key: "message", label: "Message" }
  ], rows: rows };
}

function genManagerRights(ctx) {
  var d = ctx.data;
  var rows = (d.managers || []).map(function (m) {
    return { login: String(m.login), name: m.name || "", rights: (m.rights || []).join(", "),
      groups: (m.groups || []).join(", ") || "(all)", session: m.session || "" };
  });
  return { columns: [
    { key: "login", label: "Login" }, { key: "name", label: "Name" }, { key: "rights", label: "Rights" },
    { key: "groups", label: "Groups" }, { key: "session", label: "Session" }
  ], rows: rows };
}

function genServerConfig(ctx) {
  var p = ctx.params, d = ctx.data, specs = d.specs || {};
  var rows = Object.keys(specs).filter(function (s) { return inSymbols(s, p); }).sort().map(function (s) {
    var sp = specs[s] || {};
    return { symbol: s, digits: sp.digits != null ? sp.digits : null,
      contract_size: sp.contract != null ? sp.contract : null,
      tick_size: sp.tickSize != null ? sp.tickSize : null, tick_value: sp.tickValue != null ? sp.tickValue : null,
      vol_min: sp.volMin != null ? sp.volMin : null, vol_max: sp.volMax != null ? sp.volMax : null,
      vol_step: sp.volStep != null ? sp.volStep : null,
      swap_long: sp.swapLong != null ? sp.swapLong : null, swap_short: sp.swapShort != null ? sp.swapShort : null,
      session: sp.session || "" };
  });
  return { columns: [
    { key: "symbol", label: "Symbol" }, { key: "digits", label: "Digits" },
    { key: "contract_size", label: "Contract" }, { key: "tick_size", label: "Tick size" },
    { key: "tick_value", label: "Tick value" }, { key: "vol_min", label: "Min vol" },
    { key: "vol_max", label: "Max vol" }, { key: "vol_step", label: "Vol step" },
    { key: "swap_long", label: "Swap long" }, { key: "swap_short", label: "Swap short" },
    { key: "session", label: "Session" }
  ], rows: rows };
}

function genGroupConfig(ctx) {
  var p = ctx.params, d = ctx.data, counts = {};
  (d.accounts || []).forEach(function (x) { counts[x.group] = (counts[x.group] || 0) + 1; });
  var rows = (d.groups || []).filter(function (g) { return inList(g.id, p.groups); }).map(function (g) {
    return { id: g.id, name: g.name || g.id, accounts: counts[g.id] || 0,
      leverage: "1:" + (g.lev || g.leverage || "?"),
      margin_call_pct: g.mc != null ? g.mc : null, stopout_pct: g.so != null ? g.so : null,
      swap_free: g.swapFree ? "yes" : "no", min_deposit: g.minDep != null ? num(g.minDep) : null };
  });
  return { columns: [
    { key: "id", label: "Group ID" }, { key: "name", label: "Name" }, { key: "accounts", label: "Accounts" },
    { key: "leverage", label: "Leverage" }, { key: "margin_call_pct", label: "Margin call %" },
    { key: "stopout_pct", label: "Stop-out %" }, { key: "swap_free", label: "Swap-free" },
    { key: "min_deposit", label: "Min deposit" }
  ], rows: rows };
}

function genDataIntegrity(ctx) {
  var p = ctx.params, d = ctx.data;
  var rows = (d.feedHealth || []).filter(function (x) { return inSymbols(x.symbol, p); }).map(function (x) {
    return { symbol: x.symbol, state: x.state || "", quote_age_sec: x.ageSec != null ? num(x.ageSec) : null,
      source: x.source || "", manual_hold: x.manualHold ? "yes" : "no",
      health: x.state === "LIVE" ? "ok" : (x.state === "CLOSED" ? "market closed" : "stale") };
  }).sort(function (a, b) { return a.symbol < b.symbol ? -1 : 1; });
  return { columns: [
    { key: "symbol", label: "Symbol" }, { key: "state", label: "State" },
    { key: "quote_age_sec", label: "Quote age (s)" }, { key: "source", label: "Source" },
    { key: "manual_hold", label: "Manual hold" }, { key: "health", label: "Health" }
  ], rows: rows };
}

/* ================= FINANCE ================= */

function genMoneyDetail(types, ctx) {
  var p = ctx.params, d = ctx.data;
  var rows = opsIn(p, d, types).map(function (x) {
    return { time: new Date(x.time).toISOString(), login: String(x.login), name: acctName(d, x.login),
      group: x.group || "", type: x.type, amount: r2(x.amount), currency: x.currency || "",
      comment: x.comment || "" };
  }).sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  return { columns: [
    { key: "time", label: "Time (UTC)" }, { key: "login", label: "Login" }, { key: "name", label: "Name" },
    { key: "group", label: "Group" }, { key: "type", label: "Type" }, { key: "amount", label: "Amount" },
    { key: "currency", label: "Currency" }, { key: "comment", label: "Comment" }
  ], rows: rows };
}

function genCommission(ctx) {
  var p = ctx.params, d = ctx.data, rows = {}, rates = d.commissionRates || {};
  dealsIn(p, d).forEach(function (x) {
    var k = String(x.login);
    var a = rows[k] || (rows[k] = { login: k, name: acctName(d, x.login), group: x.group || "",
      deals: 0, volume: 0, turnover_m: 0, commission: 0 });
    a.deals++; a.volume += num(x.volume);
    var sp = (d.specs || {})[x.symbol] || {};
    var px = num(x.closePrice) || num(x.openPrice);
    var tm = num(x.volume) * num(sp.contract) * px / 1e6;
    a.turnover_m += tm; a.commission += num(x.commission);
  });
  var out = Object.keys(rows).sort().map(function (k) {
    var a = rows[k];
    return { login: a.login, name: a.name, group: a.group, deals: a.deals, volume: r2(a.volume),
      turnover_m: r2(a.turnover_m), rate_usd_per_m: rates[a.group] != null ? num(rates[a.group]) : null,
      commission: r2(a.commission) };
  }).sort(function (a, b) { return b.commission - a.commission; });
  return { columns: [
    { key: "login", label: "Login" }, { key: "name", label: "Name" }, { key: "group", label: "Group" },
    { key: "deals", label: "Deals" }, { key: "volume", label: "Volume" },
    { key: "turnover_m", label: "Turnover ($M)" }, { key: "rate_usd_per_m", label: "Rate $/M" },
    { key: "commission", label: "Commission" }
  ], rows: out };
}

/* Swap accrual estimate for open positions across the held days, using the
 * swap-day multiplier (e.g. triple-swap day) from the swap engine when
 * available; falls back to a plain per-day rate otherwise. Position open
 * times are local (time-of-day), so the day count is an estimate. */
function genSwap(ctx) {
  var p = ctx.params, d = ctx.data, now = Date.now();
  var SE = (typeof root.SwapEngine !== "undefined") ? root.SwapEngine : null;
  var free = {};
  (d.swapFreeGroups || []).forEach(function (g) { free[g] = true; });
  var rows = (d.positions || []).filter(function (x) {
    return inLogins(x.login, p) && inGroups(x.group, p) && inSymbols(x.symbol, p);
  }).map(function (x) {
    var sp = (d.specs || {})[x.symbol] || {};
    var openT = x.openTimeMs || now;
    var days = Math.max(1, Math.round((now - openT) / 86400000));
    var rate = num(x.side === "sell" ? sp.swapShort : sp.swapLong);
    var total = 0, multNote = [];
    if (!free[x.group] && rate !== 0) {
      for (var i = 0; i < days; i++) {
        var day = new Date(openT + i * 86400000);
        var m = 1;
        if (SE && SE.weekdayMultiplier) {
          try { m = SE.weekdayMultiplier(day, { swap_enabled: true }, {}); } catch (e) { m = 1; }
        }
        if (m !== 1) multNote.push(toDayUTC(day.getTime()) + "x" + m);
        total += rate * num(x.volume) * m;
      }
    }
    return { login: String(x.login), name: acctName(d, x.login), symbol: x.symbol, side: x.side,
      volume: r2(x.volume), days_held_est: days, rate_per_lot_day: r2(rate),
      swap_free: free[x.group] ? "yes" : "no", multiplier_days: multNote.join(", ") || "—",
      swap_accrued_est: r2(total) };
  }).sort(function (a, b) { return Math.abs(b.swap_accrued_est) - Math.abs(a.swap_accrued_est); });
  return { columns: [
    { key: "login", label: "Login" }, { key: "name", label: "Name" }, { key: "symbol", label: "Symbol" },
    { key: "side", label: "Side" }, { key: "volume", label: "Volume" }, { key: "days_held_est", label: "Days held (est)" },
    { key: "rate_per_lot_day", label: "Rate/lot/day" }, { key: "swap_free", label: "Swap-free" },
    { key: "multiplier_days", label: "Multiplier days" }, { key: "swap_accrued_est", label: "Swap accrued (est)" }
  ], rows: rows };
}

function genRevenueBySymbol(ctx) {
  var p = ctx.params, d = ctx.data, rows = {};
  dealsIn(p, d).forEach(function (x) {
    var a = rows[x.symbol] || (rows[x.symbol] = { symbol: x.symbol, deals: 0, volume: 0,
      spread_revenue: 0, commission: 0, client_pl: 0 });
    a.deals++; a.volume += num(x.volume);
    a.spread_revenue += num(x.spreadRev); a.commission += num(x.commission);
    a.client_pl += num(x.profit) - num(x.commission) + num(x.swap);
  });
  var out = Object.keys(rows).sort().map(function (s) {
    var a = rows[s];
    return { symbol: s, deals: a.deals, volume: r2(a.volume),
      spread_revenue: r2(a.spread_revenue), commission: r2(a.commission),
      client_pl: r2(a.client_pl),
      desk_pnl_est: r2(a.spread_revenue + a.commission - a.client_pl * (1 - coverPctFor(s, d) / 100)) };
  }).sort(function (a, b) { return b.desk_pnl_est - a.desk_pnl_est; });
  return { columns: [
    { key: "symbol", label: "Symbol" }, { key: "deals", label: "Deals" }, { key: "volume", label: "Volume" },
    { key: "spread_revenue", label: "Spread revenue" }, { key: "commission", label: "Commission" },
    { key: "client_pl", label: "Client P/L" }, { key: "desk_pnl_est", label: "Desk P/L (est)" }
  ], rows: out };
}

/* ================= GROWTH ================= */

function genAccountsByGroup(ctx) {
  var p = ctx.params, d = ctx.data, rows = {};
  (d.accounts || []).filter(function (x) { return inLogins(x.login, p) && inGroups(x.group, p); })
    .forEach(function (x) {
      var k = monthKey(x.createdAt || Date.now()) + "|" + (x.group || "(none)");
      var a = rows[k] || (rows[k] = { month: monthKey(x.createdAt || Date.now()), group: x.group || "(none)",
        opened: 0, funded: 0, activated: 0 });
      a.opened++;
      if (x.firstDepositAt) a.funded++;
      if (x.firstTradeAt) a.activated++;
    });
  var out = Object.keys(rows).sort().map(function (k) {
    var a = rows[k];
    return { month: a.month, group: a.group, opened: a.opened, funded: a.funded, activated: a.activated,
      funded_pct: a.opened ? r2(a.funded / a.opened * 100) : 0,
      activated_pct: a.opened ? r2(a.activated / a.opened * 100) : 0 };
  });
  return { columns: [
    { key: "month", label: "Month" }, { key: "group", label: "Group" }, { key: "opened", label: "Opened" },
    { key: "funded", label: "First-funded" }, { key: "activated", label: "First-trade" },
    { key: "funded_pct", label: "Funded %" }, { key: "activated_pct", label: "Activated %" }
  ], rows: out };
}

function genConversionFunnel(ctx) {
  var p = ctx.params, d = ctx.data, rows = {};
  (d.accounts || []).filter(function (x) { return inLogins(x.login, p) && inGroups(x.group, p); })
    .forEach(function (x) {
      var m = monthKey(x.createdAt || Date.now());
      var a = rows[m] || (rows[m] = { month: m, created: 0, deposited: 0, traded: 0 });
      a.created++;
      if (x.firstDepositAt) a.deposited++;
      if (x.firstTradeAt) a.traded++;
    });
  var out = Object.keys(rows).sort().map(function (m) {
    var a = rows[m];
    return { month: a.month, created: a.created, deposited: a.deposited, traded: a.traded,
      deposit_rate_pct: a.created ? r2(a.deposited / a.created * 100) : 0,
      trade_rate_pct: a.created ? r2(a.traded / a.created * 100) : 0 };
  });
  return { columns: [
    { key: "month", label: "Signup month" }, { key: "created", label: "Created" },
    { key: "deposited", label: "Deposited" }, { key: "traded", label: "Traded" },
    { key: "deposit_rate_pct", label: "Deposit %" }, { key: "trade_rate_pct", label: "Trade %" }
  ], rows: out };
}

function genActivitySeg(ctx) {
  var p = ctx.params, d = ctx.data, now = Date.now(), lastAct = {}, deals90 = {};
  (d.deals || []).forEach(function (x) {
    var k = String(x.login);
    lastAct[k] = Math.max(lastAct[k] || 0, x.closeTime);
    if (now - x.closeTime <= 90 * 86400000) deals90[k] = (deals90[k] || 0) + 1;
  });
  (d.balanceOps || []).forEach(function (x) {
    var k = String(x.login);
    lastAct[k] = Math.max(lastAct[k] || 0, x.time);
  });
  (d.accounts || []).forEach(function (x) {
    var k = String(x.login);
    lastAct[k] = Math.max(lastAct[k] || 0, x.createdAt || 0);
  });
  var rows = (d.accounts || []).filter(function (x) { return inLogins(x.login, p) && inGroups(x.group, p); })
    .map(function (x) {
      var k = String(x.login), days = Math.floor((now - (lastAct[k] || now)) / 86400000);
      var seg = days < 30 ? "active" : (days <= 90 ? "idle" : "dormant");
      return { login: k, name: x.name || k, group: x.group || "", segment: seg,
        days_since_activity: days, deals_90d: deals90[k] || 0 };
    }).sort(function (a, b) { return a.days_since_activity - b.days_since_activity; });
  return { columns: [
    { key: "login", label: "Login" }, { key: "name", label: "Name" }, { key: "group", label: "Group" },
    { key: "segment", label: "Segment" }, { key: "days_since_activity", label: "Days since activity" },
    { key: "deals_90d", label: "Deals (90d)" }
  ], rows: rows };
}

function genDepositFreq(ctx) {
  var p = ctx.params, d = ctx.data, rows = {};
  opsIn(p, d, ["deposit"]).forEach(function (x) {
    var m = monthKey(x.time);
    var a = rows[m] || (rows[m] = { month: m, deposits: 0, total: 0, by: {} });
    a.deposits++; a.total += num(x.amount); a.by[String(x.login)] = (a.by[String(x.login)] || 0) + 1;
  });
  var out = Object.keys(rows).sort().map(function (m) {
    var a = rows[m], logins = Object.keys(a.by);
    var repeat = logins.filter(function (l) { return a.by[l] > 1; }).length;
    return { month: a.month, deposits: a.deposits, depositors: logins.length,
      repeat_depositors: repeat, total: r2(a.total),
      avg_per_deposit: a.deposits ? r2(a.total / a.deposits) : 0 };
  });
  return { columns: [
    { key: "month", label: "Month" }, { key: "deposits", label: "Deposits" },
    { key: "depositors", label: "Depositors" }, { key: "repeat_depositors", label: "Repeat depositors" },
    { key: "total", label: "Total" }, { key: "avg_per_deposit", label: "Avg / deposit" }
  ], rows: out };
}

function genTopAccounts(ctx) {
  var p = ctx.params, d = ctx.data, rows = {};
  dealsIn(p, d).forEach(function (x) {
    var k = String(x.login);
    var a = rows[k] || (rows[k] = { login: k, name: acctName(d, x.login), group: x.group || "",
      deals: 0, volume: 0, net_pl: 0 });
    a.deals++; a.volume += num(x.volume);
    a.net_pl += num(x.profit) - num(x.commission) + num(x.swap);
  });
  var out = Object.keys(rows).sort().map(function (k) {
    var a = rows[k];
    return { login: a.login, name: a.name, group: a.group, deals: a.deals,
      volume: r2(a.volume), net_pl: r2(a.net_pl) };
  }).sort(function (a, b) { return b.volume - a.volume; }).slice(0, 100);
  return { columns: [
    { key: "login", label: "Login" }, { key: "name", label: "Name" }, { key: "group", label: "Group" },
    { key: "deals", label: "Deals" }, { key: "volume", label: "Volume" }, { key: "net_pl", label: "Net P/L" }
  ], rows: out };
}

function genIBAttribution(ctx) {
  var p = ctx.params, d = ctx.data;
  var vol = {}, cliCt = {};
  dealsIn(p, d).forEach(function (x) {
    var a = (d.accounts || []).filter(function (c) { return String(c.login) === String(x.login); })[0];
    var ib = a && a.ib ? a.ib : null;
    if (!ib) return;
    vol[ib] = (vol[ib] || 0) + num(x.volume);
    cliCt[ib] = cliCt[ib] || {};
    cliCt[ib][String(x.login)] = true;
  });
  var out = (d.ibs || []).map(function (ib) {
    var v = vol[ib.id] || 0;
    return { ib: ib.name || ib.id, code: ib.code || "", clients_traded: Object.keys(cliCt[ib.id] || {}).length,
      volume: r2(v), commission_due: r2(v * num(ib.perLot)) };
  }).sort(function (a, b) { return b.volume - a.volume; });
  return { columns: [
    { key: "ib", label: "IB" }, { key: "code", label: "Code" },
    { key: "clients_traded", label: "Clients traded" }, { key: "volume", label: "Volume" },
    { key: "commission_due", label: "Commission due" }
  ], rows: out };
}

/* ================= report definitions (39) ================= */
var DEFS = [
  { id: "client_performance_summary", name: "Client performance summary",
    purpose: "Per-login performance for the period: deals, win rate, profit factor, expectancy. Local scope.",
    category: "trading", defaultSchedule: "daily",
    params: [pFrom(), pTo(), pLogins(), pGroups(), pSymbols()], generate: genClientPerformance },
  { id: "symbol_performance_summary", name: "Symbol performance summary",
    purpose: "Per-symbol performance: deals, volume, win rate, net P/L, spread revenue. Local scope.",
    category: "trading", defaultSchedule: "daily",
    params: [pFrom(), pTo(), pLogins(), pGroups(), pSymbols()], generate: genSymbolPerformance },
  { id: "group_performance_summary", name: "Group performance summary",
    purpose: "Per-group rollup of accounts traded, deals, volume and net P/L. Local scope.",
    category: "trading", defaultSchedule: "daily",
    params: [pFrom(), pTo(), pGroups(), pSymbols()], generate: genGroupPerformance },
  { id: "equity_curve_report", name: "Equity curve report",
    purpose: "Per-login, per-day P/L and cumulative P/L reconstructed from closed deals. Local scope.",
    category: "trading", defaultSchedule: "daily",
    params: [pFrom(), pTo(), pLogins(), pGroups()], generate: genEquityCurve },
  { id: "order_activity_log", name: "Order activity log",
    purpose: "Open pending orders as recorded locally. Order history is not retained locally, so only live orders appear.",
    category: "trading", defaultSchedule: "daily",
    params: [pLogins(), pGroups(), pSymbols()], generate: genOrderActivity },
  { id: "position_detail_register", name: "Position detail register",
    purpose: "Open positions at generation time with floating P/L and margin level. Local scope.",
    category: "trading", defaultSchedule: "daily",
    params: [pLogins(), pGroups(), pSymbols()], generate: genPositionDetail },
  { id: "dealing_desk_summary", name: "Dealing desk summary",
    purpose: "Dealer decisions for the period from the local dealer log: accepted, declined, requoted.",
    category: "trading", defaultSchedule: "daily", params: [pFrom(), pTo()], generate: genDealingDesk },
  { id: "manual_quote_log", name: "Manual quote log",
    purpose: "Quotes thrown by dealers into the price flow (F4): symbol, bid/ask, volume, hold time, actor.",
    category: "trading", defaultSchedule: "daily", params: [pFrom(), pTo(), pSymbols()], generate: genManualQuoteLog },

  { id: "stopout_event_log", name: "Stop-out event log",
    purpose: "Stop-out executions parsed from the local audit trail. Local scope.",
    category: "risk", defaultSchedule: "daily", params: [pFrom(), pTo()], generate: genStopoutLog },
  { id: "exposure_by_account", name: "Exposure by account",
    purpose: "Per-account open exposure: long/short/net lots, floating P/L, margin level. Local scope.",
    category: "risk", defaultSchedule: "daily",
    params: [pLogins(), pGroups(), pSymbols()], generate: genExposureByAccount },
  { id: "exposure_by_symbol", name: "Exposure by symbol",
    purpose: "Per-symbol book exposure with configured exposure-alert thresholds. Local scope.",
    category: "risk", defaultSchedule: "daily",
    params: [pLogins(), pGroups(), pSymbols()], generate: genExposureBySymbol },
  { id: "book_flow_report", name: "A-book / B-book flow report",
    purpose: "Retained vs covered flow per symbol estimated from local book rules (default B-book). Estimates.",
    category: "risk", defaultSchedule: "daily",
    params: [pLogins(), pGroups(), pSymbols()], generate: genBookFlow },
  { id: "retained_pnl_attribution", name: "Retained P/L attribution",
    purpose: "Desk P/L per symbol: spread + commission + estimated retained client flow. Estimates.",
    category: "risk", defaultSchedule: "daily",
    params: [pFrom(), pTo(), pGroups(), pSymbols()], generate: genRetainedPnl },
  { id: "hedge_ratio_report", name: "Hedge ratio report",
    purpose: "Hedge ratio and coverage status per symbol from local positions and book rules.",
    category: "risk", defaultSchedule: "daily",
    params: [pLogins(), pGroups(), pSymbols()], generate: genHedgeRatio },
  { id: "drawdown_ranking", name: "Drawdown ranking",
    purpose: "Per-login peak drawdown reconstructed from closed deals, ranked worst first. Local scope.",
    category: "risk", defaultSchedule: "daily",
    params: [pFrom(), pTo(), pLogins(), pGroups()], generate: genDrawdown },

  { id: "requote_analysis", name: "Requote analysis",
    purpose: "Dealer decision mix from the local dealer log: accepted, declined, requoted.",
    category: "execution", defaultSchedule: "daily", params: [pFrom(), pTo()], generate: genRequoteAnalysis },
  { id: "rejection_log", name: "Rejection log",
    purpose: "Declined dealer requests with reasons, from the local dealer log.",
    category: "execution", defaultSchedule: "daily", params: [pFrom(), pTo()], generate: genRejectionLog },
  { id: "dealer_response_time", name: "Dealer response report",
    purpose: "Queued requests (wait time) and dealer decisions from local dealing records.",
    category: "execution", defaultSchedule: "daily",
    params: [pFrom(), pTo(), pLogins(), pSymbols()], generate: genDealerResponse },
  { id: "slippage_summary", name: "Slippage summary",
    purpose: "Signed price drift per symbol after fills, from local markout data. Local scope.",
    category: "execution", defaultSchedule: "daily", params: [pSymbols()], generate: genSlippage },
  { id: "pending_order_lifetime", name: "Pending order lifetime",
    purpose: "Open pending orders ranked by age; expiry shown where set. Local scope.",
    category: "execution", defaultSchedule: "daily",
    params: [pLogins(), pGroups(), pSymbols()], generate: genPendingLifetime },

  { id: "login_activity_log", name: "Login activity log",
    purpose: "Client login sessions recorded locally: time, IP, device. Local scope.",
    category: "operations", defaultSchedule: "daily",
    params: [pFrom(), pTo(), pLogins(), pGroups()], generate: genLoginActivity },
  { id: "system_event_log", name: "System event log",
    purpose: "Trade-server journal entries by component and level for the period. Local scope.",
    category: "operations", defaultSchedule: "daily", params: [pFrom(), pTo()], generate: genSystemEvents },
  { id: "manager_rights_snapshot", name: "Manager rights snapshot",
    purpose: "Manager sessions and rights on this device (local roster only).",
    category: "operations", defaultSchedule: "daily", params: [], generate: genManagerRights },
  { id: "server_config_snapshot", name: "Server configuration snapshot",
    purpose: "Symbol contract specs snapshot (canonical + local edits).",
    category: "operations", defaultSchedule: "monthly", params: [pSymbols()], generate: genServerConfig },
  { id: "group_config_report", name: "Group configuration report",
    purpose: "Client group settings: leverage, margin call / stop-out levels, swap-free, min deposit.",
    category: "operations", defaultSchedule: "monthly", params: [pGroups()], generate: genGroupConfig },
  { id: "data_integrity_check", name: "Data integrity check",
    purpose: "Price-feed health per symbol: state, quote age, source, manual holds. Live from the feed.",
    category: "operations", defaultSchedule: "daily", params: [pSymbols()], generate: genDataIntegrity },

  { id: "deposits_detail", name: "Deposits detail",
    purpose: "Deposit balance operations for the period. Local scope.",
    category: "finance", defaultSchedule: "daily",
    params: [pFrom(), pTo(), pLogins(), pGroups()],
    generate: function (ctx) { return genMoneyDetail(["deposit"], ctx); } },
  { id: "withdrawals_detail", name: "Withdrawals detail",
    purpose: "Withdrawal balance operations for the period. Local scope.",
    category: "finance", defaultSchedule: "daily",
    params: [pFrom(), pTo(), pLogins(), pGroups()],
    generate: function (ctx) { return genMoneyDetail(["withdrawal"], ctx); } },
  { id: "internal_transfer_report", name: "Internal transfer report",
    purpose: "Internal transfers between accounts for the period. Empty when none were recorded locally.",
    category: "finance", defaultSchedule: "daily",
    params: [pFrom(), pTo(), pLogins(), pGroups()],
    generate: function (ctx) { return genMoneyDetail(["transfer_in", "transfer_out"], ctx); } },
  { id: "commission_summary", name: "Commission summary",
    purpose: "Commission accrual per login from configured per-group $/M rates. Estimates from local plans.",
    category: "finance", defaultSchedule: "daily",
    params: [pFrom(), pTo(), pLogins(), pGroups(), pSymbols()], generate: genCommission },
  { id: "swap_summary", name: "Swap summary",
    purpose: "Swap accrual on open positions incl. swap-day multipliers from the swap engine. Estimates; open times are local.",
    category: "finance", defaultSchedule: "daily",
    params: [pLogins(), pGroups(), pSymbols()], generate: genSwap },
  { id: "bonus_credit_register", name: "Bonus & credit register",
    purpose: "Bonuses and credits granted for the period. Local scope.",
    category: "finance", defaultSchedule: "daily",
    params: [pFrom(), pTo(), pLogins(), pGroups()],
    generate: function (ctx) { return genMoneyDetail(["bonus"], ctx); } },
  { id: "revenue_by_symbol", name: "Revenue by symbol",
    purpose: "Broker revenue per symbol: spread revenue + commission + estimated retained flow. Estimates.",
    category: "finance", defaultSchedule: "daily",
    params: [pFrom(), pTo(), pGroups(), pSymbols()], generate: genRevenueBySymbol },

  { id: "accounts_growth_by_group", name: "Accounts growth by group",
    purpose: "Accounts opened, first-funded and first-trade-activated per month and group. Local scope.",
    category: "growth", defaultSchedule: "monthly", params: [pLogins(), pGroups()], generate: genAccountsByGroup },
  { id: "deposit_conversion_funnel", name: "Deposit conversion funnel",
    purpose: "Signup-month cohorts: created → first deposit → first trade. Local scope.",
    category: "growth", defaultSchedule: "monthly", params: [pLogins(), pGroups()], generate: genConversionFunnel },
  { id: "activity_segmentation", name: "Activity segmentation",
    purpose: "Accounts segmented active (<30d) / idle (30–90d) / dormant (>90d) by last activity. Local scope.",
    category: "growth", defaultSchedule: "monthly",
    params: [pLogins(), pGroups()], generate: genActivitySeg },
  { id: "deposit_frequency_report", name: "Deposit frequency report",
    purpose: "Deposit counts, depositors and repeat-depositor share per month. Local scope.",
    category: "growth", defaultSchedule: "monthly", params: [pLogins(), pGroups()], generate: genDepositFreq },
  { id: "top_accounts_by_volume", name: "Top accounts by volume",
    purpose: "Top 100 accounts by traded volume for the period. Local scope.",
    category: "growth", defaultSchedule: "daily",
    params: [pFrom(), pTo(), pGroups()], generate: genTopAccounts },
  { id: "ib_attribution_summary", name: "IB attribution summary",
    purpose: "Introducing-broker attribution: clients traded, volume, commission due at the IB rate. Local scope.",
    category: "growth", defaultSchedule: "monthly", params: [pFrom(), pTo()], generate: genIBAttribution }
];

/* ---- registration ---- */
function registerAll(reg) {
  reg = reg || (root.OrbitReports && root.OrbitReports.defaultRegistry);
  if (!reg) throw new Error("reports-catalog: no report registry available (load shared/reports.js first)");
  var added = 0;
  DEFS.forEach(function (def) {
    if (typeof reg.has === "function" && reg.has(def.id)) return; /* idempotent */
    reg.register(def);
    added++;
  });
  return added;
}

/* Auto-register into the shared default registry when both are present in
 * the browser (script order: shared/reports.js, then this file). */
try {
  if (root.OrbitReports && root.OrbitReports.registerCustomReport) {
    DEFS.forEach(function (def) {
      try {
        if (!root.OrbitReports.getAnyReport(def.id)) root.OrbitReports.registerCustomReport(def);
      } catch (e) { /* duplicate on re-entry — ignore */ }
    });
  }
} catch (e) { /* tests register explicitly */ }

var CATALOG = {
  DEFS: DEFS,
  COUNT: DEFS.length,
  CATEGORIES: REPORT_CATEGORIES,
  registerAll: registerAll
};
if (typeof module !== "undefined" && module.exports) { module.exports = CATALOG; }
else { root.OrbitReportsCatalog = CATALOG; }
})(typeof globalThis !== "undefined" ? globalThis : this);
