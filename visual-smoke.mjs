import { chromium } from "playwright";
import fs from "node:fs";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];
page.on("pageerror",e=>errors.push("pageerror: "+e.message));
page.on("console",m=>{if(m.type()==="error")errors.push("console: "+m.text());});
await page.goto("http://127.0.0.1:4173/index.html",{waitUntil:"domcontentloaded",timeout:30000});
await page.waitForTimeout(1800);
const role=await page.locator("body").getAttribute("data-ot-app");
if(role==="terminal"){
  const login=page.locator("#login.on");
  if(await login.count()){
    const enter=page.getByRole("button",{name:/Enter demo/i});
    if(await enter.count())await enter.first().click();
  }
  await page.waitForTimeout(1600);
}else if(role==="manager"){
  const demo=page.locator("#entry-demo");
  if(await demo.count() && await demo.isVisible())await demo.click();
  await page.waitForTimeout(900);
}else if(role==="admin"){
  const local=page.getByRole("button",{name:/Local setup/i});
  if(await local.count() && await local.first().isVisible())await local.first().click();
  await page.waitForTimeout(900);
}
const cmd=page.locator("#ot-commandbar");
if(!(await cmd.count()) || !(await cmd.isVisible()))throw new Error("desktop command bar is not visible");
const status=page.locator("#ot-statusbar");
if(!(await status.isVisible()))throw new Error("desktop status bar is not visible");
const phone=page.locator(".phone").first();
const box=await phone.boundingBox();
if(!box || box.width<1100 || box.height<700)throw new Error("desktop workstation did not expand: "+JSON.stringify(box));
if(role==="terminal"){
  for(const id of ["#scr-quotes","#scr-chart","#scr-trade"]){
    const x=page.locator(id);if(!(await x.isVisible()))throw new Error(id+" is not visible in workstation");
  }
  const q=await page.locator("#scr-quotes").boundingBox(),c=await page.locator("#scr-chart").boundingBox(),t=await page.locator("#scr-trade").boundingBox();
  if(!q||!c||!t)throw new Error("terminal panes missing geometry");
  if(q.width>460)throw new Error("Market Watch too wide for compact workstation: "+q.width);
  if(c.width<700)throw new Error("chart workspace too narrow: "+c.width);
  if(t.height>430)throw new Error("toolbox too tall: "+t.height);
}
fs.mkdirSync("qa-artifacts",{recursive:true});
await page.screenshot({path:"qa-artifacts/"+role+"-1440x900.png",fullPage:false});
await page.setViewportSize({width:390,height:844});
await page.waitForTimeout(500);
await page.screenshot({path:"qa-artifacts/"+role+"-390x844.png",fullPage:false});
const serious=errors.filter(x=>!/Failed to load resource|ERR_NAME_NOT_RESOLVED|CORS|net::ERR|WebSocket connection.*failed|Unexpected response code: 451/.test(x));
if(serious.length)throw new Error("browser errors:\n"+serious.join("\n"));
console.log(role+" visual smoke PASS");
await browser.close();
