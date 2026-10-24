'use strict';
// Gacha Forge · 마개조 server patch v0.1.0 for Gacha Forge 1.8.13 (Marinara Engine 2.5.1).
// Loaded with NODE_OPTIONS=--require=/app/gf-mod-runtime.cjs. Edits the Gacha Forge server module in memory
// while it loads; no file on disk changes. If the module is not the exact 1.8.13 build, or any edit site is
// missing or ambiguous, nothing is applied and the game runs unmodified (fail closed).
// Composes with other --require patches (customizer, CG, webp): it transforms whatever source the
// earlier hooks hand it and touches none of their edit sites.
//
// Environment
//   GF_MOD_RANK_REFILL   "1" (default) refill Vigor to full on a commander rank-up, "0" keeps the game's +20
//   GF_MOD_AETHER        "1" (default) opens the Aether top-up shelf, "0" closes it
//   GF_MOD_AETHER_PACKS  optional JSON: [{"id":"s","amount":300,"label":"소량","price":"₩1,200"}, ...]
//   GF_MOD_OFF           "1" disables the whole patch
const crypto = require('node:crypto');
const fs = require('node:fs');
const { registerHooks } = require('node:module');
const { fileURLToPath } = require('node:url');

const VERSION = '0.1.0';
const TARGET = /[\\/]capability-runtime-snapshots[\\/]gacha-forge-1\.8\.13-[^\\/]+[\\/]server\.mjs$/;
const ORIGINAL_SHA256 = 'defce243452149ed999f24ca2c8ae6615ba9d743ea54a7987c7194b1ae0d3fec';
const TAG = '[gf-mod]';

const DEFAULT_PACKS = [
  { id: 's', amount: 300, label: '소량 충전', price: '₩1,200' },
  { id: 'm', amount: 1600, label: '10연 한 번', price: '₩6,500' },
  { id: 'l', amount: 8000, label: '천장 대비', price: '₩33,000' },
  { id: 'xl', amount: 16000, label: '월급 탕진', price: '₩65,000' },
];
function readPacks() {
  const raw = process.env.GF_MOD_AETHER_PACKS;
  if (!raw) return DEFAULT_PACKS;
  try {
    const list = JSON.parse(raw);
    const packs = (Array.isArray(list) ? list : []).slice(0, 8).map((p, i) => ({
      id: String(p && p.id || 'p' + i).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16) || 'p' + i,
      amount: Math.max(1, Math.min(1000000, Math.round(Number(p && p.amount) || 0))),
      label: String(p && p.label || '').slice(0, 40),
      price: String(p && p.price || '').slice(0, 40),
    })).filter((p) => p.amount > 0);
    return packs.length ? packs : DEFAULT_PACKS;
  } catch { return DEFAULT_PACKS; }
}
const config = {
  version: VERSION,
  rankRefill: process.env.GF_MOD_RANK_REFILL !== '0',
  aetherEnabled: process.env.GF_MOD_AETHER !== '0',
  packs: readPacks(),
};

// Each edit: `old` must occur exactly once in the source it is given.
const EDITS = [
  {
    name: 'rank-up refills Vigor',
    old: 'if(N>0){P=N*eA;let B=s.wallet||(s.wallet={...Xe});B.vigor=Math.max(0,Math.round(Number(B.vigor)||0))+P}',
    new: 'if(N>0){P=N*eA;let B=s.wallet||(s.wallet={...Xe});B.vigor=Math.max(0,Math.round(Number(B.vigor)||0))+P;'
      + 'let __gm=globalThis.__gfMod;if(__gm&&__gm.rankRefill){let __max=Xy+(k-1)*Q0;B.vigor<__max&&(P+=__max-B.vigor,B.vigor=__max)}}',
  },
  {
    name: 'mod routes',
    old: 's.post("/level-up",async p=>{',
    new: 's.post("/gf-mod/status",async()=>{let G=globalThis.__gfMod||{};return{ok:!0,version:G.version,rankRefill:!!G.rankRefill,aether:{enabled:!!G.aetherEnabled,packs:G.aetherEnabled?G.packs:[]}}}),'
      + 's.post("/gf-mod/aether/charge",async p=>{let u=p&&p.body||{},o=l(u.runId),G=globalThis.__gfMod||{};'
      + 'if(!G.aetherEnabled)return{ok:!1,error:"disabled"};'
      + 'let K=(G.packs||[]).find(x=>x.id===String(u.pack||""));if(!o||!K)return{ok:!1,error:"bad-request"};'
      + 'let{data:g}=await be();if(!Ae(g,o))return{ok:!1,error:"bad-request"};await Mr(o);'
      + 'let{doc:b,data:S}=await pe(o),x=At(S.wallet||{...Xe},S);x.aether=Math.max(0,Math.round(Number(x.aether)||0))+K.amount;S.wallet=x;'
      + 'if(!await Pe(o,b,S))return{ok:!1,error:"write-conflict"};return{ok:!0,added:K.amount,wallet:at(x,S)}}),'
      + 's.post("/level-up",async p=>{',
  },
];

function count(h, n) { return h.split(n).length - 1; }
function applyEdits(source) {
  // The 1.8.13 build itself, or that build already transformed by other patches: either way every site must be unique.
  let next = source;
  for (let i = 0; i < EDITS.length; i++) {
    const { old, new: replacement } = EDITS[i];
    if (count(next, old) !== 1) return { ok: false, error: 'signature mismatch', index: i + 1, name: EDITS[i].name };
    next = next.replace(old, () => replacement);
  }
  return { ok: true, source: next };
}

if (process.env.GF_MOD_HOOK_TEST !== '1' && process.env.GF_MOD_OFF !== '1') {
  if (typeof registerHooks !== 'function') {
    process.stderr.write(TAG + ' this Node.js has no module.registerHooks (need 22.15+); patch disabled, game unchanged\n');
  } else {
    registerHooks({
      load(url, context, nextLoad) {
        if (!url.startsWith('file:')) return nextLoad(url, context);
        let filename;
        try { filename = fileURLToPath(url); } catch { return nextLoad(url, context); }
        if (!TARGET.test(filename)) return nextLoad(url, context);
        const result = nextLoad(url, context);
        let original = '';
        try { original = fs.readFileSync(filename, 'utf8'); } catch {}
        if (crypto.createHash('sha256').update(original).digest('hex') !== ORIGINAL_SHA256) {
          process.stderr.write(TAG + ' fail closed: server.mjs is not the Gacha Forge 1.8.13 build this patch was made for\n');
          return result;
        }
        const source = result.source == null ? original : Buffer.isBuffer(result.source) ? result.source.toString('utf8') : String(result.source);
        const out = applyEdits(source);
        if (!out.ok) {
          process.stderr.write(TAG + ' fail closed: ' + out.error + ' #' + out.index + ' (' + out.name + '); game unchanged\n');
          return result;
        }
        globalThis.__gfMod = config;
        process.stderr.write(TAG + ' v' + VERSION + ' applied ' + EDITS.length + ' edits in memory (rank refill ' + (config.rankRefill ? 'on' : 'off')
          + ', aether shelf ' + (config.aetherEnabled ? 'on' : 'off') + ')\n');
        return { ...result, source: out.source, shortCircuit: true };
      },
    });
    process.stderr.write(TAG + ' hook registered (no files changed)\n');
  }
}
module.exports = { applyEdits, EDITS, config, TARGET, ORIGINAL_SHA256 };
