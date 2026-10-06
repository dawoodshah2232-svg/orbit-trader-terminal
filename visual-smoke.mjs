import { chromium } from "playwright";
import fs from "node:fs";

const browser=await chromium.launch({headless:true});

async function settle(page,role){
  if(role==="terminal"){
    const login=page.locator("#login.on");
    if(await login.count()){
      const enter=page.getByRole("button",{name:/Enter demo/i});
      if(await enter.count() && await enter.first().isVisible())await enter.first().click();
    }
    await page.waitForTimeout(700);
    const skip=page.getByRole("button",{name:/^Skip$/i});
    if(await skip.count() && await skip.first().isVisible())await skip.first().click();
    await page.waitForTimeout(900);
  }else if(role==="manager"){
    const demo=page.locator("#entry-demo");
    if(await demo.count() && await demo.isVisible())await demo.click();
    await page.waitForTimeout(2600);
  }else if(role==="admin"){
    const local=page.getByRole("button",{name:/Local setup/i});
    if(await local.count() && await local.first().isVisible())await local.first().click();
    await page.waitForTimeout(2600);
  }
}

async function capture(viewport,name,isDesktop){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,locale:"en-US"});
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",e=>errors.push("pageerror: "+e.message));
  page.on("console",m=>{if(m.type()==="error")errors.push("console: "+m.text());});
  await page.goto("http://127.0.0.1:4173/index.html?theme=dark",{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForTimeout(1700);
  const role=await page.locator("body").getAttribute("data-ot-app");
  await settle(page,role);
  if(isDesktop){
    const cmd=page.locator("#ot-commandbar");
    if(!(await cmd.count()) || !(await cmd.isVisible()))throw new Error("desktop command bar is not visible");
    const status=page.locator("#ot-statusbar");
    if(!(await status.count()) || !(await status.isVisible()))throw new Error("desktop status bar is not visible");
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
      if(t.width<c.width-8)throw new Error("toolbox does not fill chart workspace: "+JSON.stringify({toolbox:t.width,chart:c.width}));
    }
  }
  fs.mkdirSync("qa-artifacts",{recursive:true});
  await page.screenshot({path:"qa-artifacts/"+role+"-"+name+".png",fullPage:false});
  const serious=errors.filter(x=>!/Failed to load resource|ERR_NAME_NOT_RESOLVED|CORS|net::ERR|WebSocket connection.*failed|Unexpected response code: 451/.test(x));
  if(serious.length)throw new Error("browser errors:\n"+serious.join("\n"));
  await context.close();
  return role;
}

const role=await capture({width:1440,height:900},"1440x900",true);
await capture({width:390,height:844},"390x844",false);
console.log(role+" desktop + fresh-mobile visual smoke PASS");
await browser.close();
