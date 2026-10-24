// usage: node explore.mjs [--ext file.js]... step...   steps: "p:Label" press, "c:css" click, "w:ms", "s:name" screenshot, "e:js" eval in shadow (r)
import { boot, openPage, chromium } from "./boot.mjs";
const argv = process.argv.slice(2); const exts = []; const steps = [];
for (let i = 0; i < argv.length; i++) argv[i] === "--ext" ? exts.push(argv[++i]) : steps.push(argv[i]);
const b = await boot({ exts, quiet: !process.env.LOUD });
if (process.env.SEED) await (await import(process.env.SEED)).default(b);
const browser = await chromium.launch();
const g = await openPage(browser, b.base, process.env.PHONE ? { width: 844, height: 390 } : undefined);
const R = 'document.querySelector("marinara-capability-gacha-forge").shadowRoot';
for (const s of steps) {
  const [k, ...rest] = s.split(":"); const v = rest.join(":");
  if (k === "p") console.log("press", v, await g.press(v));
  else if (k === "c") { console.log("click", v, await g.page.evaluate(`(()=>{const e=${R}.querySelector(${JSON.stringify(v)});if(e){e.click();return true}return false})()`)); await g.page.waitForTimeout(700); }
  else if (k === "w") await g.page.waitForTimeout(+v);
  else if (k === "s") await g.page.screenshot({ path: v + ".png" });
  else if (k === "e") console.log("eval", JSON.stringify(await g.page.evaluate(`(()=>{const r=${R};${v}})()`)).slice(0, 4000));
}
console.log("screen", await g.screen());
console.log("buttons", JSON.stringify(await g.buttons()));
await g.page.screenshot({ path: "shot.png" });
console.log("errors", g.errors.slice(0, 5));
console.log("api", JSON.stringify(b.api.map((x) => x.m + " " + x.p)).slice(0, 1500));
await browser.close(); b.srv.close();
