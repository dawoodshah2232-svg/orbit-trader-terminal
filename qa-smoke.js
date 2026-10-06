"use strict";
const fs=require("fs");
const html=fs.readFileSync("index.html","utf8");
let pass=0,fail=0;
function check(name,cond,detail){
  if(cond){pass++;console.log("ok  "+name);}
  else{fail++;console.error("FAIL "+name+(detail?" — "+detail:""));}
}
check("workstation stylesheet loaded",html.includes("workstation.css"));
check("workstation script loaded",html.includes("workstation.js"));
check("version source loaded",html.includes("version.js"));
check("no stale OrbitTrader 6.1",!html.includes("OrbitTrader 6.1"));
check("no stale About OrbitTrader 5",!html.includes("About OrbitTrader 5"));
check("no coming-soon placeholder",!/coming soon/i.test(html));
const inline=[];
const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m;
while((m=re.exec(html))) if(m[1].trim()) inline.push(m[1]);
inline.forEach((code,i)=>{
  try{new Function(code);check("inline script "+(i+1)+" parses",true);}
  catch(e){check("inline script "+(i+1)+" parses",false,e.message);}
});
console.log(pass+" passed, "+fail+" failed");
process.exit(fail?1:0);
