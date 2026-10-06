(function(root){
"use strict";
var build=Object.freeze({
  product:"OrbitTrader",
  version:"6.3.0",
  shortVersion:"6.3",
  channel:"workstation",
  build:"2026.10.06-ws1",
  builtAt:"2026-10-06",
  environment:"demo-capable"
});
root.OrbitBuild=build;
function normalize(){
  var app=(document.body&&document.body.dataset&&document.body.dataset.otApp)||"";
  var role=app==="manager"?" — Manager":app==="admin"?" — Administrator":"";
  document.title="OrbitTrader "+build.shortVersion+role;
  var walker=document.createTreeWalker(document.body||document.documentElement,NodeFilter.SHOW_TEXT);
  var n,rx=/OrbitTrader(?:\s+Terminal)?\s+(?:5(?:\.\d+)?|6(?:\.0|\.1|\.2)?)/g;
  while((n=walker.nextNode())){
    if(n.parentElement&&/^(SCRIPT|STYLE|TEXTAREA)$/i.test(n.parentElement.tagName))continue;
    if(rx.test(n.nodeValue)){rx.lastIndex=0;n.nodeValue=n.nodeValue.replace(rx,"OrbitTrader "+build.shortVersion);}
    rx.lastIndex=0;
  }
  document.querySelectorAll("[data-ot-version]").forEach(function(el){el.textContent=build.version;});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",normalize,{once:true});
else normalize();
})(window);