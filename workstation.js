(function(){
"use strict";
var body=document.body;
if(!body)return;
var app=body.dataset.otApp||(
  document.querySelector("#scr-chart")?"terminal":
  document.querySelector("#s-clients")?"manager":
  document.querySelector("#ctree")||document.querySelector("#authgate")?"admin":""
);
if(!app)return;
body.dataset.otApp=app;
var build=window.OrbitBuild||{version:"6.3.0",shortVersion:"6.3",build:"workstation"};
var desktop=window.matchMedia("(min-width:1024px)");
var layoutKey="ot-workstation-layout-v1";
var densityKey="ot-workstation-density-v1";
var popup=null,ctx=null,palette=null;
var commandMap=[];

function el(tag,cls,html){
  var n=document.createElement(tag);if(cls)n.className=cls;if(html!=null)n.innerHTML=html;return n;
}
function qs(s,root){return (root||document).querySelector(s);}
function qsa(s,root){return Array.prototype.slice.call((root||document).querySelectorAll(s));}
function call(name){
  var args=Array.prototype.slice.call(arguments,1);
  try{var fn=window[name];if(typeof fn==="function")return fn.apply(window,args);}catch(e){console.warn("Orbit workstation action failed",name,e);}
}
function currentSymbol(){
  try{if(typeof S!=="undefined"&&S&&S.chartSym)return S.chartSym;}catch(e){}
  var x=qs("#ch-sym");return x&&x.textContent?x.textContent.trim():null;
}
function clickTab(key){
  var t=qs('.mtab[data-t="'+key+'"]');
  if(t){t.click();return true;}
  var all=qsa(".mtab");
  for(var i=0;i<all.length;i++){
    if((all[i].textContent||"").trim().toLowerCase()===String(key).toLowerCase()){all[i].click();return true;}
  }
  return false;
}
function nav(name){if(typeof window.nav==="function")return window.nav(name);return clickTab(name);}
function svg(path){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+path+'</svg>';}
var ICON={
  order:svg('<path d="M5 12h14M14 7l5 5-5 5"/>'),
  watch:svg('<path d="M4 5h16M4 10h16M4 15h10M4 20h7"/>'),
  chart:svg('<path d="M4 18l5-6 4 3 7-9"/><path d="M4 4v16h16"/>'),
  toolbox:svg('<path d="M4 7h16v12H4z"/><path d="M8 7V4h8v3M4 11h16"/>'),
  search:svg('<circle cx="11" cy="11" r="6"/><path d="M16 16l5 5"/>'),
  dom:svg('<path d="M5 6h14M7 10h10M9 14h6M11 18h2"/>'),
  indicator:svg('<path d="M5 20V9M12 20V4M19 20v-7"/><path d="M3 20h18"/>'),
  theme:svg('<path d="M20 15a8 8 0 11-11-11 7 7 0 0011 11z"/>'),
  history:svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>'),
  settings:svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>')
};

function addCommand(label,run,shortcut,group){
  commandMap.push({label:label,run:run,shortcut:shortcut||"",group:group||""});
}
function buildCommands(){
  commandMap=[];
  if(app==="terminal"){
    addCommand("New Order",function(){call("openTicket",currentSymbol());},"F9","Trading");
    addCommand("Market Watch",function(){nav("quotes");},"Ctrl+M","View");
    addCommand("Chart",function(){nav("chart");},"","View");
    addCommand("Toolbox / Trade",function(){nav("trade");},"Ctrl+T","View");
    addCommand("History",function(){nav("history");},"","View");
    addCommand("Indicators",function(){call("sheetIndicators");},"","Insert");
    addCommand("Depth of Market",function(){call("sheetDOM",currentSymbol());},"","Trading");
    addCommand("Symbol Specification",function(){var s=currentSymbol();if(s)call("sheetSymbol",s);},"","Trading");
    addCommand("Price Alert",function(){var s=currentSymbol();call("sheetAlertNew",s);},"","Trading");
    addCommand("News",function(){call("sheetNews");},"","Research");
    addCommand("Economic Calendar",function(){call("sheetCalendar");},"","Research");
    addCommand("Mailbox",function(){call("sheetMailbox");},"","Services");
    addCommand("Options Board",function(){nav("options");},"","Analysis");
    addCommand("Strategy Lab",function(){nav("tester");},"","Analysis");
    addCommand("Portfolio",function(){nav("portfolio");},"","Analysis");
    addCommand("Settings",function(){nav("settings");},"","View");
  }else if(app==="manager"){
    ["overview","clients","positions","risk","pending","dealing","symbols","requests","reports","alerts","broadcast","ibs","settings","accounts","market","corpops","cover","payments","subs","system","docs"].forEach(function(k){
      addCommand("Open "+k.replace(/\b\w/g,function(m){return m.toUpperCase();}),function(){clickTab(k);},"","Manager");
    });
  }else{
    qsa(".mtab").forEach(function(t){
      var name=(t.textContent||"").replace(/\s+/g," ").trim();
      if(name)addCommand("Open "+name,function(){t.click();},"","Administrator");
    });
    addCommand("Security",function(){clickTab("Security");},"","Administrator");
    addCommand("Monitoring",function(){clickTab("Monitoring");},"","Administrator");
  }
  addCommand("Toggle Theme",function(){call("toggleTheme");},"","View");
  addCommand("Compact Density",function(){setDensity("compact");},"","View");
  addCommand("Comfortable Density",function(){setDensity("comfortable");},"","View");
  addCommand("Reset Workstation Layout",resetLayout,"","View");
}

function menuDefinitions(){
  if(app==="terminal")return {
    File:[
      ["New Order",function(){call("openTicket",currentSymbol());},"F9"],
      ["Account",function(){nav("account");},""],
      ["Settings",function(){nav("settings");},""]
    ],
    View:[
      ["Market Watch",function(){nav("quotes");},"Ctrl+M"],
      ["Navigator",toggleNavigator,"Ctrl+N"],
      ["Toolbox",function(){nav("trade");},"Ctrl+T"],
      ["History",function(){nav("history");},""],
      ["Compact density",function(){setDensity("compact");},""],
      ["Comfortable density",function(){setDensity("comfortable");},""]
    ],
    Insert:[
      ["Indicators",function(){call("sheetIndicators");},""],
      ["Drawing tools",function(){call("toggleDrawbar");},""],
      ["Price alert",function(){call("sheetAlertNew",currentSymbol());},""]
    ],
    Charts:[
      ["Chart workspace",function(){nav("chart");},""],
      ["1 chart",function(){var b=qs('#mc-seg [data-n="1"]');if(b)b.click();},""],
      ["2 charts",function(){var b=qs('#mc-seg [data-n="2"]');if(b)b.click();},""],
      ["4 charts",function(){var b=qs('#mc-seg [data-n="4"]');if(b)b.click();},""]
    ],
    Trading:[
      ["New Order",function(){call("openTicket",currentSymbol());},"F9"],
      ["Depth of Market",function(){call("sheetDOM",currentSymbol());},""],
      ["Trade / Positions",function(){nav("trade");},""],
      ["History",function(){nav("history");},""]
    ],
    Tools:[
      ["Strategy Lab",function(){nav("tester");},""],
      ["Options Board",function(){nav("options");},""],
      ["Economic Calendar",function(){call("sheetCalendar");},""],
      ["Command Search",openPalette,"Ctrl+K"]
    ],
    Help:[
      ["About / Account",function(){nav("account");},""],
      ["Reset Layout",resetLayout,""]
    ]
  };
  if(app==="manager")return {
    Clients:[["Clients",function(){clickTab("clients");},""],["Accounts",function(){clickTab("accounts");},""]],
    Trading:[["Positions",function(){clickTab("positions");},""],["Pending Orders",function(){clickTab("pending");},""],["Dealer Queue",function(){clickTab("dealing");},""]],
    Risk:[["Risk",function(){clickTab("risk");},""],["Alerts",function(){clickTab("alerts");},""]],
    Operations:[["Requests",function(){clickTab("requests");},""],["Symbols",function(){clickTab("symbols");},""],["Broadcast",function(){clickTab("broadcast");},""]],
    Reports:[["Reports",function(){clickTab("reports");},""]],
    View:[["Compact density",function(){setDensity("compact");},""],["Comfortable density",function(){setDensity("comfortable");},""],["Command Search",openPalette,"Ctrl+K"]]
  };
  return {
    Platform:[["Dashboard",function(){qsa(".mtab")[0]&&qsa(".mtab")[0].click();},""],["Server",function(){findTab("server");},""]],
    Trading:[["Symbols",function(){findTab("symbols");},""],["Groups",function(){findTab("groups");},""],["Corporate actions",function(){findTab("corporate");},""]],
    Execution:[["Feeds",function(){findTab("feed");},""],["Liquidity",function(){findTab("liquidity");},""],["Routing",function(){findTab("routing");},""]],
    Security:[["Managers",function(){findTab("manager");},""],["Security",function(){findTab("security");},""],["Audit",function(){findTab("audit");},""]],
    Operations:[["Monitoring",function(){findTab("monitor");},""],["Journal",function(){findTab("journal");},""],["Settings",function(){findTab("setting");},""]],
    View:[["Compact density",function(){setDensity("compact");},""],["Comfortable density",function(){setDensity("comfortable");},""],["Command Search",openPalette,"Ctrl+K"]]
  };
}
function findTab(part){
  part=String(part).toLowerCase();
  var tabs=qsa(".mtab,.citem");
  for(var i=0;i<tabs.length;i++)if((tabs[i].textContent||"").toLowerCase().indexOf(part)>=0){tabs[i].click();return true;}
  return false;
}

function buildChrome(){
  if(qs("#ot-commandbar"))return;
  var bar=el("div","","");bar.id="ot-commandbar";
  var brand=el("div","ot-brand-mini",'<span class="ot-brand-dot"></span><span>OrbitTrader</span>');
  bar.appendChild(brand);
  var defs=menuDefinitions();
  Object.keys(defs).forEach(function(name){
    var b=el("button","ot-menu",name);b.type="button";b.setAttribute("aria-expanded","false");
    b.addEventListener("click",function(ev){ev.stopPropagation();openMenu(b,defs[name]);});
    bar.appendChild(b);
  });
  var sep=el("span","ot-cmd-sep");bar.appendChild(sep);
  if(app==="terminal"){
    bar.appendChild(toolButton("New Order",ICON.order,function(){call("openTicket",currentSymbol());},true));
    bar.appendChild(toolButton("Market Watch",ICON.watch,function(){nav("quotes");}));
    bar.appendChild(toolButton("Chart",ICON.chart,function(){nav("chart");}));
    bar.appendChild(toolButton("Toolbox",ICON.toolbox,function(){nav("trade");}));
    bar.appendChild(toolButton("DOM",ICON.dom,function(){call("sheetDOM",currentSymbol());}));
    bar.appendChild(toolButton("Indicators",ICON.indicator,function(){call("sheetIndicators");}));
  }else if(app==="manager"){
    bar.appendChild(toolButton("Clients",ICON.watch,function(){clickTab("clients");}));
    bar.appendChild(toolButton("Positions",ICON.chart,function(){clickTab("positions");}));
    bar.appendChild(toolButton("Dealer",ICON.order,function(){clickTab("dealing");}));
    bar.appendChild(toolButton("Reports",ICON.history,function(){clickTab("reports");}));
  }else{
    bar.appendChild(toolButton("Symbols",ICON.watch,function(){findTab("symbols");}));
    bar.appendChild(toolButton("Groups",ICON.toolbox,function(){findTab("groups");}));
    bar.appendChild(toolButton("Execution",ICON.chart,function(){findTab("liquidity")||findTab("routing");}));
    bar.appendChild(toolButton("Settings",ICON.settings,function(){findTab("setting");}));
  }
  var spacer=el("span","ot-cmd-spacer");bar.appendChild(spacer);
  var search=toolButton("Command search",ICON.search,openPalette);search.title="Command search (Ctrl+K)";bar.appendChild(search);
  var theme=toolButton("Theme",ICON.theme,function(){call("toggleTheme");});bar.appendChild(theme);
  var chip=el("span","ot-build-chip","v"+build.version);bar.appendChild(chip);
  document.body.appendChild(bar);

  var status=el("div");status.id="ot-statusbar";
  status.innerHTML='<span><i class="ot-sdot" id="ot-online-dot"></i><span id="ot-online">ONLINE</span></span>'+
    '<span id="ot-role">'+app.toUpperCase()+'</span><span id="ot-context">—</span><span class="grow"></span>'+
    '<span id="ot-clock" class="num">--:--:--</span><span>v'+build.version+'</span>';
  document.body.appendChild(status);

  palette=el("div");palette.id="ot-command-palette";
  palette.innerHTML='<div class="ot-palette-box" role="dialog" aria-modal="true" aria-label="Command search"><input id="ot-palette-input" autocomplete="off" placeholder="Search commands…"><div class="ot-palette-list" id="ot-palette-list"></div></div>';
  palette.addEventListener("mousedown",function(e){if(e.target===palette)closePalette();});
  document.body.appendChild(palette);
  ctx=el("div");ctx.id="ot-context-menu";document.body.appendChild(ctx);
}
function toolButton(title,icon,run,primary){
  var b=el("button","ot-tool"+(primary?" primary":""),icon+'<span>'+title+'</span>');b.type="button";b.title=title;b.addEventListener("click",run);return b;
}
function openMenu(anchor,items){
  closePopup();
  popup=el("div","ot-popup-menu");
  items.forEach(function(it){
    var b=el("button","",'<span>'+it[0]+'</span><small>'+((it[2]||""))+'</small>');
    b.addEventListener("click",function(){closePopup();it[1]();});
    popup.appendChild(b);
  });
  document.body.appendChild(popup);
  var r=anchor.getBoundingClientRect();popup.style.left=Math.min(r.left,window.innerWidth-popup.offsetWidth-8)+"px";popup.style.top=r.bottom+"px";
  anchor.setAttribute("aria-expanded","true");popup._anchor=anchor;
  setTimeout(function(){document.addEventListener("mousedown",outsidePopup,{once:true});},0);
}
function outsidePopup(e){if(popup&&popup.contains(e.target))return;closePopup();}
function closePopup(){if(!popup)return;if(popup._anchor)popup._anchor.setAttribute("aria-expanded","false");popup.remove();popup=null;}

function buildPalette(){
  buildCommands();
  var input=qs("#ot-palette-input"),list=qs("#ot-palette-list");
  if(!input||!list)return;
  function render(){
    var q=input.value.trim().toLowerCase();
    var rows=commandMap.filter(function(c){return !q||c.label.toLowerCase().indexOf(q)>=0||c.group.toLowerCase().indexOf(q)>=0;}).slice(0,30);
    list.innerHTML="";
    rows.forEach(function(c,i){
      var b=el("button","ot-palette-item"+(i===0?" sel":""),'<span>'+c.label+'</span><kbd>'+c.shortcut+'</kbd>');
      b.addEventListener("click",function(){closePalette();c.run();});list.appendChild(b);
    });
  }
  input.addEventListener("input",render);
  input.addEventListener("keydown",function(e){
    var items=qsa(".ot-palette-item",list),sel=qs(".ot-palette-item.sel",list),i=items.indexOf(sel);
    if(e.key==="ArrowDown"&&items.length){e.preventDefault();if(sel)sel.classList.remove("sel");items[(i+1+items.length)%items.length].classList.add("sel");}
    else if(e.key==="ArrowUp"&&items.length){e.preventDefault();if(sel)sel.classList.remove("sel");items[(i-1+items.length)%items.length].classList.add("sel");}
    else if(e.key==="Enter"&&sel){e.preventDefault();sel.click();}
    else if(e.key==="Escape"){e.preventDefault();closePalette();}
  });
  palette._render=render;
}
function openPalette(){
  if(!palette)return;palette.classList.add("on");var input=qs("#ot-palette-input");input.value="";if(palette._render)palette._render();setTimeout(function(){input.focus();},0);
}
function closePalette(){if(palette)palette.classList.remove("on");}

function setDensity(v){body.dataset.otDensity=v;try{localStorage.setItem(densityKey,v);}catch(e){}}
function applyDensity(){var v="compact";try{v=localStorage.getItem(densityKey)||"compact";}catch(e){}setDensity(v);}
function resetLayout(){
  try{localStorage.removeItem(layoutKey);}catch(e){}
  document.documentElement.style.setProperty("--ot-left","286px");
  document.documentElement.style.setProperty("--ot-bottom","236px");
  document.documentElement.style.setProperty("--ot-nav-height","164px");
}
function loadLayout(){
  try{
    var x=JSON.parse(localStorage.getItem(layoutKey)||"{}");
    if(x.left)document.documentElement.style.setProperty("--ot-left",x.left+"px");
    if(x.bottom)document.documentElement.style.setProperty("--ot-bottom",x.bottom+"px");
    if(x.nav)document.documentElement.style.setProperty("--ot-nav-height",x.nav+"px");
  }catch(e){}
}
function saveLayout(left,bottom,navh){
  var x={};try{x=JSON.parse(localStorage.getItem(layoutKey)||"{}");}catch(e){}
  if(left)x.left=left;if(bottom)x.bottom=bottom;if(navh)x.nav=navh;
  try{localStorage.setItem(layoutKey,JSON.stringify(x));}catch(e){}
}
function buildSplitters(){
  if(app!=="terminal")return;
  var vs=el("div");vs.id="ot-vsplit";document.body.appendChild(vs);
  var hs=el("div");hs.id="ot-hsplit";document.body.appendChild(hs);
  dragSplit(vs,"x");dragSplit(hs,"y");
}
function dragSplit(node,axis){
  node.addEventListener("pointerdown",function(e){
    if(!desktop.matches)return;e.preventDefault();node.setPointerCapture(e.pointerId);node.classList.add("dragging");
    function move(ev){
      if(axis==="x"){
        var v=Math.max(220,Math.min(430,ev.clientX));document.documentElement.style.setProperty("--ot-left",v+"px");
      }else{
        var v=Math.max(155,Math.min(420,window.innerHeight-24-ev.clientY));document.documentElement.style.setProperty("--ot-bottom",v+"px");
      }
    }
    function up(ev){
      node.classList.remove("dragging");try{node.releasePointerCapture(ev.pointerId);}catch(_){}
      var cs=getComputedStyle(document.documentElement);
      saveLayout(parseFloat(cs.getPropertyValue("--ot-left")),parseFloat(cs.getPropertyValue("--ot-bottom")));
      node.removeEventListener("pointermove",move);node.removeEventListener("pointerup",up);
    }
    node.addEventListener("pointermove",move);node.addEventListener("pointerup",up);
  });
}
function buildNavigator(){
  if(app!=="terminal")return;
  var host=qs("#scr-quotes");if(!host||qs("#ot-navigator"))return;
  var n=el("div");n.id="ot-navigator";
  n.innerHTML='<div class="ot-nav-title"><span>Navigator</span><span>▴</span></div><div class="ot-nav-body"></div>';
  var b=qs(".ot-nav-body",n);
  [
    ["Accounts",function(){nav("account");}],
    ["Indicators",function(){call("sheetIndicators");}],
    ["Chart Objects",function(){call("sheetObjects");}],
    ["Strategy Lab",function(){nav("tester");}],
    ["Options Board",function(){nav("options");}],
    ["News",function(){call("sheetNews");}],
    ["Calendar",function(){call("sheetCalendar");}],
    ["Mailbox",function(){call("sheetMailbox");}]
  ].forEach(function(x){var bt=el("button","",x[0]);bt.addEventListener("click",x[1]);b.appendChild(bt);});
  qs(".ot-nav-title",n).addEventListener("click",function(){n.classList.toggle("open");qs(".ot-nav-title span:last-child",n).textContent=n.classList.contains("open")?"▾":"▴";});
  host.appendChild(n);
}
function toggleNavigator(){var n=qs("#ot-navigator");if(n){n.classList.toggle("open");qs(".ot-nav-title span:last-child",n).textContent=n.classList.contains("open")?"▾":"▴";}}

function showContext(x,y,items){
  if(!ctx)return;ctx.innerHTML="";
  items.forEach(function(it){var b=el("button",it[2]?"danger":"",it[0]);b.addEventListener("click",function(){hideContext();it[1]();});ctx.appendChild(b);});
  ctx.classList.add("on");ctx.style.left=Math.min(x,window.innerWidth-225)+"px";ctx.style.top=Math.min(y,window.innerHeight-ctx.offsetHeight-28)+"px";
}
function hideContext(){if(ctx)ctx.classList.remove("on");}
function bindContexts(){
  if(app!=="terminal")return;
  document.addEventListener("contextmenu",function(e){
    if(!desktop.matches)return;
    var row=e.target.closest(".rx-qrow");
    if(row&&/^qr-/.test(row.id)){
      e.preventDefault();var sym=row.id.slice(3);
      showContext(e.clientX,e.clientY,[
        ["New Order",function(){call("openTicket",sym);}],
        ["Chart Window",function(){call("openChart",sym);}],
        ["Depth of Market",function(){call("sheetDOM",sym);}],
        ["Specification",function(){call("sheetSymbol",sym);}],
        ["Create Alert",function(){call("sheetAlertNew",sym);}]
      ]);return;
    }
    var chart=e.target.closest("#chartwrap");
    if(chart){
      e.preventDefault();showContext(e.clientX,e.clientY,[
        ["New Order",function(){call("openTicket",currentSymbol());}],
        ["Indicators",function(){call("sheetIndicators");}],
        ["Drawing Tools",function(){call("toggleDrawbar");}],
        ["Depth of Market",function(){call("sheetDOM",currentSymbol());}],
        ["Symbol Specification",function(){call("sheetSymbol",currentSymbol());}]
      ]);
    }
  });
  document.addEventListener("mousedown",function(e){if(ctx&&!ctx.contains(e.target))hideContext();});
}
function bindKeys(){
  document.addEventListener("keydown",function(e){
    var tag=(e.target&&e.target.tagName)||"";
    var typing=/INPUT|TEXTAREA|SELECT/.test(tag);
    if(e.key==="Escape"){hideContext();closePopup();closePalette();return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openPalette();return;}
    if(!desktop.matches||typing)return;
    if(app==="terminal"){
      if(e.key==="F9"){e.preventDefault();call("openTicket",currentSymbol());}
      else if(e.ctrlKey&&e.key.toLowerCase()==="m"){e.preventDefault();nav("quotes");}
      else if(e.ctrlKey&&e.key.toLowerCase()==="n"){e.preventDefault();toggleNavigator();}
      else if(e.ctrlKey&&e.key.toLowerCase()==="t"){e.preventDefault();nav("trade");}
    }
  });
}
function refreshStatus(){
  var online=navigator.onLine;
  var dot=qs("#ot-online-dot"),txt=qs("#ot-online");
  if(dot){dot.className="ot-sdot"+(online?"":" off");}if(txt)txt.textContent=online?"ONLINE":"OFFLINE";
  var clock=qs("#ot-clock");if(clock)clock.textContent=new Date().toLocaleTimeString([],{hour12:false});
  var c=qs("#ot-context");
  if(c){
    if(app==="terminal"){
      var sym=currentSymbol()||"—",acct="DEMO";
      try{if(typeof S!=="undefined"&&S){acct=(S.acctLabel||S.acctId||"DEMO");}}catch(e){}
      c.textContent=acct+" | "+sym;
    }else if(app==="manager"){
      var on=qs(".mtab.on");c.textContent=on?(on.textContent||"").replace(/\s+/g," ").trim():"Manager";
    }else{
      var a=qs(".mtab.on,.citem.on");c.textContent=a?(a.textContent||"").replace(/\s+/g," ").trim():"Administrator";
    }
  }
}
function hideModeConfusion(){
  if(!desktop.matches)return;
  var seg=qs("#set-mode-seg");if(seg&&seg.parentElement)seg.parentElement.style.display="none";
  qsa("#mode-seg,[id^='d-mode-seg']").forEach(function(x){x.style.display="none";});
  try{if(app==="terminal"&&typeof setUiMode==="function")setUiMode("advanced",true);}catch(e){}
}
function init(){
  buildChrome();buildPalette();applyDensity();loadLayout();buildSplitters();buildNavigator();bindContexts();bindKeys();hideModeConfusion();refreshStatus();
  setInterval(refreshStatus,1000);
  window.addEventListener("online",refreshStatus);window.addEventListener("offline",refreshStatus);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();