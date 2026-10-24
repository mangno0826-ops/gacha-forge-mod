// host.mjs and seed.mjs come from tlsiddl/gacha-forge-customizer tests/realtest (copy them next to this file).
// Boots the REAL Gacha Forge server + client with optional extensions, returns helpers.
import fs from "node:fs";
import { createRequire } from "node:module";
import { createStore, activateServer, serve, PKG_DIR } from "./host.mjs";
import { seedWorld, sampleUnits } from "./seed.mjs";
const require = createRequire("/opt/node-tools/node_modules/");
export const { chromium } = require("playwright");
export async function boot({ server = process.env.GF_SERVER || PKG_DIR + "/server.mjs", exts = [], quiet = true } = {}) {
  const store = createStore();
  const { routes, stubCalls } = await activateServer(server, store, { quiet });
  const svg = (hue, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><rect width="200" height="300" fill="hsl(${hue},55%,40%)"/><circle cx="100" cy="112" r="46" fill="hsl(${hue},30%,82%)"/><text x="100" y="285" font-size="22" text-anchor="middle" fill="#fff">${label}</text></svg>`;
  const files = {};
  const units = sampleUnits.map((u) => (u.kind === "weapon" || u.rarity < 4 ? u : { ...u, portrait: `/img/${u.key}.svg` }));
  units.forEach((u, i) => { if (u.portrait) files[`/img/${u.key}.svg`] = ["image/svg+xml", svg((i * 47) % 360, u.key)]; });
  const runId = await seedWorld(routes, store, { name: "테스트 월드", glimmer: 2400, units, roster: { c1: { level: 20, bondFights: 4, facet: 1 }, c4: { level: 12 } } });
  const CLIENT = fs.readFileSync(PKG_DIR + "/client.js", "utf8");
  const tags = exts.map((p, i) => `<script src="/ext${i}.js"></script>`).join("");
  files["/"] = ["text/html; charset=utf-8", `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}marinara-capability-gacha-forge{position:fixed;inset:0;display:block}</style></head><body><marinara-capability-gacha-forge></marinara-capability-gacha-forge>${tags}<script src="/client.js"></script></body></html>`];
  files["/client.js"] = ["text/javascript; charset=utf-8", CLIENT];
  exts.forEach((p, i) => (files[`/ext${i}.js`] = ["text/javascript; charset=utf-8", () => fs.readFileSync(p, "utf8")]));
  const api = [];
  const srv = await serve({ routes, files, onApi: (m, p, b) => api.push({ m, p, b }) });
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { store, routes, stubCalls, runId, api, srv, base, files };
}
export async function openPage(browser, base, viewport = { width: 1280, height: 720 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 1000 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(base + "/");
  await page.waitForTimeout(1500);
  const press = async (label) => {
    const ok = await page.evaluate((label) => {
      const r = document.querySelector("marinara-capability-gacha-forge").shadowRoot;
      const b = [...r.querySelectorAll("button")].filter((x) => x.getClientRects().length).reverse()
        .find((x) => x.textContent.trim().toLowerCase().startsWith(label.toLowerCase()) || x.getAttribute("aria-label") === label);
      if (b) { b.click(); return true; } return false;
    }, label);
    await page.waitForTimeout(700);
    return ok;
  };
  const buttons = () => page.evaluate(() => [...document.querySelector("marinara-capability-gacha-forge").shadowRoot.querySelectorAll("button")].filter((x) => x.getClientRects().length).map((b) => (b.getAttribute("aria-label") || b.textContent.trim()).slice(0, 40)));
  const screen = () => page.evaluate(() => [...document.querySelector("marinara-capability-gacha-forge").shadowRoot.querySelectorAll("[data-screen]")].filter((x) => x.getClientRects().length).map((x) => x.dataset.screen));
  return { ctx, page, errors, press, buttons, screen };
}
