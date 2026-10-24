/* Gacha Forge · 마개조 v0.1.0 — personal extension for Gacha Forge 1.8.13 on Marinara Engine 2.5.1.
 * Client-only conveniences, drawn inside the game's own shadow root with the game's tokens:
 *  - Story chapter list folded into groups of 10, opening on the latest chapter
 *  - Chapter auto-play (scenes, team pick, battle start, auto battle, result) and repeat battles
 *  - Follow Marinara's font inside the game, two extra colour themes, Home background position
 *  - Album of the pictures units send in Talk
 * Nothing here changes the game's rules or saves; every click it makes is one the player could make. */
(() => {
  "use strict";
  const KEY = "__GF_MOD_V1";
  if (typeof window[KEY] === "function") {
    try { window[KEY](); } catch {}
  }

  const HOST_TAG = "marinara-capability-gacha-forge";
  const API_BASE = "/api/gacha-forge";
  const SETTINGS_KEY = "gf-mod-v1";
  const ALBUM_KEY = "gf-mod-album-v1";
  const ALBUM_MAX = 600;
  let disposed = false;

  /* ═════════════ Storage ═════════════ */
  const DEFAULTS = {
    groups: true, // chapter list in groups of 10
    latest: true, // open the chapter list on the latest chapter
    font: false, // follow Marinara's font inside the game
    fontName: "", // or this font family instead
    theme: "", // "" = the game's HUD style, or "malang" / "midnight"
    bgPos: {}, // runId -> { x, y } in percent
    repeat: 5, // repeat battle count; 0 = until Vigor runs out
    sceneSkip: false, // auto-play skips scenes instead of reading them with Auto
  };
  const readJson = (key, fallback) => {
    try {
      const v = JSON.parse(window.localStorage.getItem(key) || "null");
      return v && typeof v === "object" ? v : fallback;
    } catch { return fallback; }
  };
  const writeJson = (key, v) => {
    try { window.localStorage.setItem(key, JSON.stringify(v)); } catch {}
  };
  const settings = { ...DEFAULTS, ...readJson(SETTINGS_KEY, {}) };
  if (!settings.bgPos || typeof settings.bgPos !== "object") settings.bgPos = {};
  const saveSettings = () => writeJson(SETTINGS_KEY, settings);
  const album = readJson(ALBUM_KEY, {}); // runId -> [{ url, who, at }]

  /* ═════════════ Current world + Talk pictures, read from the game's own traffic ═════════════ */
  const RUN_ID_RE = /^[A-Za-z0-9:_-]{1,128}$/;
  const cleanRunId = (v) => (typeof v === "string" && RUN_ID_RE.test(v.trim()) ? v.trim() : "");
  const run = { id: "" };
  const URL_OK = /^(\/(?!\/)|https:\/\/)/;
  function rememberPhotos(runId, reply) {
    if (!runId) return;
    const found = [];
    const walk = (v, who, depth) => {
      if (!v || typeof v !== "object" || depth > 6) return;
      if (Array.isArray(v)) { for (const x of v) walk(x, who, depth + 1); return; }
      // A Talk reply names its unit once (unit.name) next to the messages that carry the pictures.
      const name = typeof v.unit?.name === "string" ? v.unit.name : typeof v.name === "string" ? v.name : who;
      const p = v.photo;
      if (p && typeof p === "object" && typeof p.url === "string" && URL_OK.test(p.url))
        found.push({ url: p.url, who: name || "", at: Number(p.at) || Date.now() });
      for (const k of Object.keys(v)) if (k !== "photo") walk(v[k], name, depth + 1);
    };
    walk(reply, "", 0);
    if (!found.length) return;
    const list = Array.isArray(album[runId]) ? album[runId] : (album[runId] = []);
    const seen = new Set(list.map((x) => x.url));
    let added = 0;
    for (const f of found) if (!seen.has(f.url)) { seen.add(f.url); list.push(f); added += 1; }
    if (!added) return;
    list.sort((a, b) => a.at - b.at);
    if (list.length > ALBUM_MAX) list.splice(0, list.length - ALBUM_MAX);
    writeJson(ALBUM_KEY, album);
    if (albumOpen) paintAlbum();
  }
  const priorFetch = window.fetch;
  const observedFetch = function (input, init) {
    const result = priorFetch.apply(this, arguments);
    if (disposed) return result;
    try {
      const u = new URL(String(input && typeof input === "object" && "url" in input ? input.url : input), location.href);
      if (u.origin !== location.origin || !u.pathname.startsWith(API_BASE + "/")) return result;
      let requested = "";
      if (typeof init?.body === "string") {
        try { requested = cleanRunId(JSON.parse(init.body)?.runId); } catch {}
      }
      if (requested) run.id = requested;
      const isChat = /\/chat\//.test(u.pathname);
      const isState = /\/state$/.test(u.pathname);
      if (!isChat && !isState) return result;
      result.then((response) => {
        if (disposed || !response?.ok) return;
        if (!(response.headers?.get?.("content-type") || "").includes("json")) return;
        response.clone().json().then((v) => {
          if (!v || typeof v !== "object" || v.ok === false) return;
          if (isState && !run.id) run.id = cleanRunId(v.activeRun?.runId) || cleanRunId(v.activeRunId);
          if (isChat) rememberPhotos(requested || run.id, v);
        }, () => {});
      }, () => {});
    } catch {}
    return result;
  };
  window.fetch = observedFetch;

  /* ═════════════ Game DOM ═════════════ */
  const shadow = () => document.querySelector(HOST_TAG)?.shadowRoot || null;
  const arena = () => shadow()?.querySelector(".gf-arena") || null;
  const visible = (el) => !!el && el.isConnected && el.getClientRects().length > 0;
  const q = (sel) => { const r = shadow(); return r ? [...r.querySelectorAll(sel)].find(visible) || null : null; };
  const h = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false && kid !== "") n.append(kid);
    return n;
  };

  /* ═════════════ Look: our own pieces, the theme, the font, the Home background ═════════════ */
  const THEMES = {
    // Warm pastel on a soft plum ground; light cards like Bloom.
    malang: `--text:#FFF4F7;--surface:#FFF8FA;--on-surface:#4A2B3F;--on-coral:#FFFFFF;--ink:#2A1A2C;--ink-2:#36223A;--ink-3:#4A2F4F;
      --porcelain-2:#FCE9F0;--porcelain-3:#F2CFDD;--steel:#B07AA1;--steel-dark:#6B4A66;--steel-faint:#E3BFD3;--coral:#F0779B;--coral-deep:#D2537A;
      --amber:#FFC56B;--amber-deep:#D9952E;--epic:#B794F4;--epic-deep:#8B66D6;--jade:#4FBF9F;--alarm:#E5486B;--scanlines:0;`,
    // Deep navy and cyan, low glare for night play.
    midnight: `--text:#DCE7F5;--surface:#18233A;--on-surface:#DCE7F5;--on-coral:#04121E;--ink:#060B16;--ink-2:#0C1424;--ink-3:#152036;
      --porcelain-2:#1F2C46;--porcelain-3:#9FB3CF;--steel:#4E7BB5;--steel-dark:#1E2E4A;--steel-faint:#7F97B8;--coral:#38C6E8;--coral-deep:#1A95B8;
      --amber:#F2C14E;--amber-deep:#B88A1C;--epic:#9C86F0;--epic-deep:#6A54C8;--jade:#3DC7A0;--alarm:#F0506E;--scanlines:0;`,
  };
  const BASE_CSS = `
.gfm-dock{position:absolute;left:0;top:50%;transform:translateY(-50%);z-index:60;display:flex;align-items:center;pointer-events:none;font-family:var(--body,system-ui)}
.gfm-dock>*{pointer-events:auto}
.gfm-tab{writing-mode:vertical-rl;cursor:pointer;border:1px solid var(--steel-dark,#23374F);border-left:0;background:color-mix(in srgb,var(--ink-2,#151D2C) 92%,transparent);
  color:var(--porcelain-3,#C7D3E2);font-weight:700;font-size:var(--t-tiny,11px);letter-spacing:.12em;padding:10px 5px;border-radius:0 6px 6px 0}
.gfm-tab[data-run="1"]{color:var(--on-coral,#fff);background:var(--coral,#F2603C)}
.gfm-panel{display:flex;flex-direction:column;gap:6px;min-width:190px;max-width:240px;padding:10px;background:color-mix(in srgb,var(--ink-2,#151D2C) 96%,transparent);
  border:1px solid var(--steel-dark,#23374F);border-left:0;border-radius:0 8px 8px 0;color:var(--text,#EDF1F6);font-size:var(--t-xs,12px);box-shadow:0 6px 24px rgba(0,0,0,.35)}
.gfm-panel[hidden],.gfm-dock [hidden]{display:none!important}
.gfm-panel h4{margin:2px 0 0;font-size:var(--t-tiny,11px);letter-spacing:.12em;color:var(--steel-faint,#8AA2BC);font-weight:700}
.gfm-btn{cursor:pointer;font:inherit;font-weight:700;text-align:left;padding:7px 9px;border-radius:5px;border:1px solid var(--steel-dark,#23374F);background:var(--ink-3,#1E293B);color:var(--text,#EDF1F6)}
.gfm-btn:hover:not([disabled]){border-color:var(--coral,#F2603C)}
.gfm-btn[disabled]{opacity:.45;cursor:default}
.gfm-btn.-go{background:var(--coral,#F2603C);border-color:var(--coral,#F2603C);color:var(--on-coral,#fff)}
.gfm-row{display:flex;align-items:center;gap:6px}
.gfm-row select,.gfm-row input[type=text]{flex:1;min-width:0;font:inherit;padding:5px 6px;border-radius:4px;border:1px solid var(--steel-dark,#23374F);background:var(--ink,#0E1420);color:var(--text,#EDF1F6)}
.gfm-status{color:var(--steel-faint,#8AA2BC);line-height:1.4}
.gfm-status:empty{display:none}
.gfm-veil{position:absolute;inset:0;z-index:70;display:grid;place-items:center;background:rgba(4,8,16,.62);font-family:var(--body,system-ui)}
.gfm-sheet{width:min(860px,92%);max-height:88%;display:flex;flex-direction:column;gap:10px;padding:14px 16px;background:var(--ink-2,#151D2C);border:1px solid var(--steel-dark,#23374F);
  border-top:3px solid var(--coral,#F2603C);border-radius:8px;color:var(--text,#EDF1F6);font-size:var(--t-sm,13px)}
.gfm-sheet header{display:flex;align-items:center;gap:10px}
.gfm-sheet header b{font-size:var(--t-md,15px);letter-spacing:.06em}
.gfm-sheet header .gfm-grow{flex:1}
.gfm-body{overflow:auto;min-height:0;display:flex;flex-direction:column;gap:10px}
.gfm-set{display:grid;grid-template-columns:1fr auto;gap:4px 12px;align-items:center;padding:8px 10px;border-radius:6px;background:var(--ink-3,#1E293B)}
.gfm-set small{grid-column:1/-1;color:var(--steel-faint,#8AA2BC);font-size:var(--t-xs,12px)}
.gfm-set input[type=range]{width:160px}
.gfm-switch{cursor:pointer;min-width:52px;font:inherit;font-weight:700;padding:4px 8px;border-radius:999px;border:1px solid var(--steel-dark,#23374F);background:var(--ink,#0E1420);color:var(--steel-faint,#8AA2BC)}
.gfm-switch[aria-pressed="true"]{background:var(--coral,#F2603C);border-color:var(--coral,#F2603C);color:var(--on-coral,#fff)}
.gfm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.gfm-shot{position:relative;margin:0;cursor:zoom-in;border-radius:6px;overflow:hidden;background:var(--ink,#0E1420);aspect-ratio:3/4}
.gfm-shot img{width:100%;height:100%;object-fit:cover;display:block}
.gfm-shot figcaption{position:absolute;left:0;right:0;bottom:0;padding:3px 6px;font-size:var(--t-tiny,11px);background:linear-gradient(transparent,rgba(0,0,0,.75));color:#fff}
.gfm-big{position:absolute;inset:0;z-index:80;display:grid;place-items:center;background:rgba(0,0,0,.88);cursor:zoom-out}
.gfm-big img{max-width:94%;max-height:86%;object-fit:contain}
.gfm-big .gfm-row{position:absolute;bottom:3%;gap:10px}
.gfm-big a{color:#fff}
.gfm-empty{color:var(--steel-faint,#8AA2BC);padding:24px 4px;text-align:center}
.gfm-grp{display:flex;align-items:center;gap:12px;width:100%;cursor:pointer;margin:6px 0 2px;padding:10px 16px;border:1px solid var(--steel-dark,#23374F);border-radius:6px;
  background:color-mix(in srgb,var(--ink-2,#151D2C) 88%,transparent);color:var(--text,#EDF1F6);font-family:var(--display,inherit);font-weight:700;font-size:var(--t-sm,13px);letter-spacing:.06em;text-align:left}
.gfm-grp .gfm-grow{flex:1}
.gfm-grp small{color:var(--steel-faint,#8AA2BC);font-weight:600}
.gfm-grp[aria-expanded="true"]{border-color:var(--coral,#F2603C)}
.gfm-grp .gfm-chev{transition:transform .15s}
.gfm-grp[aria-expanded="true"] .gfm-chev{transform:rotate(90deg)}
.ch-card.gfm-folded{display:none!important}
`;
  let styleEl = null;
  function styleText() {
    let css = BASE_CSS;
    const theme = THEMES[settings.theme];
    if (theme) css += `\n.gf-arena.gf-arena[data-gfm-theme="${settings.theme}"]{${theme}}`;
    if (settings.font) {
      const fam = fontFamily();
      if (fam) css += `\n.gf-arena.gf-arena{--body:${fam}!important;--display:${fam}!important}`;
    }
    const pos = run.id && settings.bgPos[run.id];
    if (pos) css += `\n.gf-arena .hm-bg{object-position:${clampPct(pos.x)}% ${clampPct(pos.y)}%!important}`;
    return css;
  }
  const clampPct = (v) => Math.max(0, Math.min(100, Math.round(Number(v)) || 0));
  function fontFamily() {
    const own = String(settings.fontName || "").trim();
    // A font name is pasted into CSS: keep only characters a family list can contain.
    if (own) return /^[\p{L}\p{N} ,'"_-]{1,120}$/u.test(own) ? own : "";
    try { return getComputedStyle(document.body).fontFamily || ""; } catch { return ""; }
  }
  function applyLook() {
    const r = shadow();
    if (!r) return;
    const text = styleText();
    if (!styleEl || styleEl.getRootNode() !== r) {
      styleEl?.remove();
      styleEl = h("style", { "data-gfm": "" });
    }
    if (styleEl.textContent !== text) styleEl.textContent = text;
    if (!styleEl.isConnected || styleEl.parentNode !== r || r.lastChild !== styleEl) r.append(styleEl);
    for (const a of r.querySelectorAll(".gf-arena")) {
      if (THEMES[settings.theme]) { if (a.getAttribute("data-gfm-theme") !== settings.theme) a.setAttribute("data-gfm-theme", settings.theme); }
      else if (a.hasAttribute("data-gfm-theme")) a.removeAttribute("data-gfm-theme");
    }
  }

  /* ═════════════ Story chapter list: groups of 10, open on the latest ═════════════ */
  const GROUP = 10;
  const openGroups = new Map(); // runId -> Set of open group indexes, chosen by the player
  const scrolledLists = new WeakSet();
  function chapterList() {
    const r = shadow();
    return r ? r.querySelector("[data-chapters-list]") : null;
  }
  function latestCard(cards) {
    const open = cards.filter((c) => !c.classList.contains("cleared"));
    return open[0] || cards[cards.length - 1] || null;
  }
  function applyGroups() {
    const list = chapterList();
    if (!list) return;
    const cards = [...list.querySelectorAll(":scope > .ch-card[data-open-chapter]")];
    const groupsOn = settings.groups && cards.length > GROUP;
    if (!groupsOn) {
      for (const g of list.querySelectorAll(":scope > .gfm-grp")) g.remove();
      for (const c of cards) c.classList.remove("gfm-folded");
    } else {
      const latest = latestCard(cards);
      const latestGroup = latest ? Math.floor(cards.indexOf(latest) / GROUP) : 0;
      if (!openGroups.has(run.id)) openGroups.set(run.id, new Set([latestGroup]));
      const open = openGroups.get(run.id);
      const groups = Math.ceil(cards.length / GROUP);
      for (let gi = 0; gi < groups; gi++) {
        const members = cards.slice(gi * GROUP, gi * GROUP + GROUP);
        const first = Number(members[0].dataset.openChapter), last = Number(members[members.length - 1].dataset.openChapter);
        const cleared = members.filter((c) => c.classList.contains("cleared")).length;
        const expanded = open.has(gi);
        let head = list.querySelector(`:scope > .gfm-grp[data-gfm-grp="${gi}"]`);
        if (!head) {
          head = h("button", { class: "gfm-grp", type: "button", "data-gfm-grp": gi },
            h("span", { class: "gfm-chev", text: "▶" }), h("span", { class: "gfm-label" }), h("span", { class: "gfm-grow" }), h("small"));
          head.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const set = openGroups.get(run.id) || new Set();
            set.has(gi) ? set.delete(gi) : set.add(gi);
            openGroups.set(run.id, set);
            applyGroups();
          });
        }
        if (head.nextElementSibling !== members[0]) list.insertBefore(head, members[0]);
        const label = `${first}–${last}장`;
        const note = cleared === members.length ? "모두 클리어" : `클리어 ${cleared}/${members.length}`;
        if (head.querySelector(".gfm-label").textContent !== label) head.querySelector(".gfm-label").textContent = label;
        if (head.querySelector("small").textContent !== note) head.querySelector("small").textContent = note;
        if (head.getAttribute("aria-expanded") !== String(expanded)) head.setAttribute("aria-expanded", String(expanded));
        for (const c of members) c.classList.toggle("gfm-folded", !expanded);
      }
      for (const g of list.querySelectorAll(":scope > .gfm-grp")) if (Number(g.dataset.gfmGrp) >= groups) g.remove();
    }
    if (settings.latest && !scrolledLists.has(list)) {
      scrolledLists.add(list);
      // After the game restores its own scroll position, put the newest chapter in view.
      setTimeout(() => {
        if (disposed || !list.isConnected) return;
        const all = [...list.querySelectorAll(":scope > .ch-card[data-open-chapter]")];
        const open = all.filter((c) => !c.classList.contains("cleared"));
        const target = open[0] || list.querySelector(":scope > .ch-card:not([data-open-chapter])") || all[all.length - 1];
        target?.scrollIntoView({ block: "center" });
      }, 250);
    }
  }

  /* ═════════════ Auto-play and repeat battles ═════════════ */
  const auto = { mode: "", left: 0, done: 0, lastAct: 0, lastClick: new WeakMap(), skipped: new WeakSet(), note: "" };
  const STUCK_MS = 90000;
  function stopAuto(note) {
    auto.mode = "";
    auto.note = note || "";
    paintDock();
  }
  function startAuto(mode) {
    auto.mode = mode;
    auto.done = 0;
    auto.lastAct = Date.now();
    auto.note = "";
    if (mode === "repeat") auto.left = Math.max(0, Math.round(Number(settings.repeat) || 0)) || Infinity;
    paintDock();
    autoStep();
  }
  function press(el) {
    if (!el || el.disabled) return false;
    const last = auto.lastClick.get(el) || 0;
    if (Date.now() - last < 1500) return true; // the game is still reacting to the last press
    auto.lastClick.set(el, Date.now());
    auto.lastAct = Date.now();
    el.click();
    return true;
  }
  function autoStep() {
    if (disposed || !auto.mode) return;
    if (q(".cb-msg [data-back]")) return stopAuto("전투를 준비하지 못해서 멈췄어요. 게임 화면의 안내를 확인해 주세요.");
    // Result screen
    const resultCont = q("[data-result-continue]");
    if (resultCont) {
      const lost = !!resultCont.closest(".root.lose") || !!q(".root.lose [data-screen=\"result\"]");
      if (lost) return stopAuto("패배해서 멈췄어요.");
      const again = q("[data-result-again]");
      if (auto.mode === "repeat") {
        if (!again) return stopAuto(`반복 전투 ${auto.done}회를 마쳤어요.`);
        if (again.disabled) return stopAuto(`행동력이 부족해서 멈췄어요. (${auto.done}회 완료)`);
        if (auto.left <= 0) return stopAuto(`반복 전투 ${auto.done}회를 마쳤어요.`);
        if (!auto.lastClick.has(again)) { auto.left -= 1; auto.done += 1; }
        press(again);
        return paintDock();
      }
      auto.done += 1;
      press(resultCont);
      return paintDock();
    }
    // Scene reader
    const sceneCont = q("[data-continue]");
    if (sceneCont && auto.mode === "story") return void press(sceneCont);
    const autoRead = q("[data-auto]");
    if (autoRead && auto.mode === "story") {
      const skip = q("[data-skip]");
      if (settings.sceneSkip && skip && !auto.skipped.has(skip)) { auto.skipped.add(skip); press(skip); return; }
      if (autoRead.getAttribute("aria-pressed") !== "true") press(autoRead);
      auto.lastAct = Date.now(); // reading takes as long as it takes
      return;
    }
    // Before a fight: brief with the Vigor cost, then the team
    const start = q("button.fstart[data-start]");
    if (start) {
      if (start.disabled) return stopAuto("행동력이 부족해서 멈췄어요.");
      if (auto.mode === "repeat" && !auto.lastClick.has(start)) {
        if (auto.left <= 0) return stopAuto(`반복 전투 ${auto.done}회를 마쳤어요.`);
        auto.left -= 1;
        auto.done += 1;
        paintDock();
      }
      return void press(start);
    }
    const into = q("[data-into-battle]");
    if (into) return void press(into);
    // In a fight: hand it to the game's own Auto
    const autoFight = q("button.auto");
    if (autoFight) {
      if (autoFight.getAttribute("aria-pressed") !== "true") press(autoFight);
      auto.lastAct = Date.now();
      return;
    }
    // Chapter map: the next node that can be played
    if (auto.mode === "story") {
      const next = q("button.act.play, button.act.start");
      if (next) return void press(next);
      if (q("button.act.again") || q(".diff-pill")) return stopAuto("이 챕터를 끝까지 진행했어요.");
    }
    if (Date.now() - auto.lastAct > STUCK_MS) stopAuto("진행할 수 있는 버튼을 찾지 못해서 멈췄어요.");
  }

  /* ═════════════ Dock ═════════════ */
  let dock = null, panel = null, tab = null, ui = {};
  function buildDock() {
    tab = h("button", { class: "gfm-tab", type: "button", title: "마개조", text: "마개조" });
    const status = h("div", { class: "gfm-status", role: "status" });
    const story = h("button", { class: "gfm-btn -go", type: "button", text: "▶ 챕터 자동 진행" });
    const repeatSel = h("select", { "aria-label": "반복 횟수" });
    for (const [v, label] of [[3, "3회"], [5, "5회"], [10, "10회"], [20, "20회"], [0, "행동력 소진까지"]])
      repeatSel.append(h("option", { value: v, text: label, selected: Number(settings.repeat) === v }));
    const repeat = h("button", { class: "gfm-btn -go", type: "button", text: "▶ 반복 전투" });
    const stop = h("button", { class: "gfm-btn", type: "button", text: "■ 멈추기" });
    const albumBtn = h("button", { class: "gfm-btn", type: "button", text: "앨범" });
    const setBtn = h("button", { class: "gfm-btn", type: "button", text: "설정" });
    panel = h("div", { class: "gfm-panel", hidden: true },
      h("h4", { text: "자동" }), story, h("div", { class: "gfm-row" }, repeatSel), repeat, stop, status,
      h("h4", { text: "기타" }), albumBtn, setBtn);
    dock = h("div", { class: "gfm-dock", "data-gfm": "" }, tab, panel);
    tab.onclick = () => { panel.hidden = !panel.hidden; paintDock(); };
    story.onclick = () => startAuto("story");
    repeat.onclick = () => startAuto("repeat");
    stop.onclick = () => stopAuto("멈췄어요.");
    repeatSel.onchange = () => { settings.repeat = Number(repeatSel.value); saveSettings(); };
    albumBtn.onclick = () => { panel.hidden = true; openAlbum(); };
    setBtn.onclick = () => { panel.hidden = true; openSettings(); };
    ui = { status, story, repeat, stop, repeatSel };
  }
  function where() {
    if (q("[data-result-again]") || q("button.fstart[data-start]") || q("[data-into-battle]") || q("button.auto")) return "fight";
    if (q("[data-auto]")) return "scene";
    if (q("button.act.play, button.act.start, button.act.again")) return "map";
    return "";
  }
  function paintDock() {
    if (!dock) return;
    const running = !!auto.mode;
    tab.setAttribute("data-run", running ? "1" : "0");
    tab.textContent = running ? (auto.mode === "story" ? "자동 진행 중" : "반복 전투 중") : "마개조";
    if (panel.hidden) return;
    const at = where();
    ui.story.hidden = running;
    ui.repeat.hidden = running;
    ui.repeatSel.parentNode.hidden = running;
    ui.stop.hidden = !running;
    ui.story.disabled = !(at === "map" || at === "scene" || at === "fight");
    ui.repeat.disabled = !(q("[data-result-again]") || q("button.fstart[data-start]"));
    ui.repeat.title = ui.repeat.disabled ? "재료던전 전투 결과 화면이나 전투 시작 화면에서 쓸 수 있어요" : "";
    let text = auto.note;
    if (running && auto.mode === "repeat") text = `반복 전투 ${auto.done}회 진행` + (Number.isFinite(auto.left) ? ` · 남은 ${auto.left}회` : "");
    if (running && auto.mode === "story") text = `자동 진행 중 · 전투 ${auto.done}회`;
    if (!running && !text) text = at === "map" ? "챕터 지도에서 자동 진행을 시작할 수 있어요." : "";
    if (ui.status.textContent !== text) ui.status.textContent = text;
  }
  function ensureDock() {
    const a = arena();
    if (!a) return;
    if (!dock) buildDock();
    if (dock.parentNode !== a) a.append(dock);
    for (const sheet of [settingsVeil, albumVeil]) if (sheet && sheet.isConnected && sheet.parentNode !== a) a.append(sheet);
  }

  /* ═════════════ Settings sheet ═════════════ */
  let settingsVeil = null;
  function sheet(title, body, onClose) {
    const close = h("button", { class: "gfm-btn", type: "button", text: "닫기" });
    const veil = h("div", { class: "gfm-veil", "data-gfm": "" },
      h("div", { class: "gfm-sheet", role: "dialog", "aria-label": title },
        h("header", {}, h("b", { text: title }), h("span", { class: "gfm-grow" }), close), body));
    close.onclick = onClose;
    veil.addEventListener("click", (e) => { if (e.target === veil) onClose(); });
    return veil;
  }
  function switchRow(label, hint, key, after) {
    const b = h("button", { class: "gfm-switch", type: "button", "aria-pressed": String(!!settings[key]), text: settings[key] ? "켜짐" : "꺼짐" });
    b.onclick = () => {
      settings[key] = !settings[key];
      b.setAttribute("aria-pressed", String(settings[key]));
      b.textContent = settings[key] ? "켜짐" : "꺼짐";
      saveSettings();
      after?.();
      refresh();
    };
    return h("div", { class: "gfm-set" }, h("span", { text: label }), b, hint ? h("small", { text: hint }) : null);
  }
  function openSettings() {
    closeSettings();
    const body = h("div", { class: "gfm-body" });
    body.append(
      switchRow("스토리 챕터 10개씩 묶기", "챕터 목록을 10장씩 접어 두고, 최신 챕터가 있는 묶음만 펼칩니다.", "groups"),
      switchRow("챕터 목록을 최신 챕터에서 열기", "스토리에 들어가면 아직 클리어하지 않은 챕터로 바로 이동합니다.", "latest"),
      switchRow("자동 진행할 때 장면 건너뛰기", "끄면 게임의 Auto로 대사를 읽고, 켜면 Skip으로 넘깁니다.", "sceneSkip"),
      switchRow("말랑나라 글꼴을 게임에도 적용", "말랑나라 화면에 쓰는 글꼴을 가챠포지 안에도 씁니다. 아래에 글꼴 이름을 적으면 그 글꼴을 씁니다.", "font"));
    const fontInput = h("input", { type: "text", placeholder: "예: Pretendard, 'Nanum Gothic'", value: settings.fontName || "", "aria-label": "글꼴 이름" });
    fontInput.addEventListener("change", () => { settings.fontName = fontInput.value.trim().slice(0, 120); saveSettings(); refresh(); });
    body.append(h("div", { class: "gfm-set" }, h("span", { text: "글꼴 이름 (선택)" }), h("div", { class: "gfm-row" }, fontInput)));
    const themeSel = h("select", { "aria-label": "테마" });
    for (const [v, label] of [["", "게임 기본 (HUD 스타일 따라감)"], ["malang", "말랑 파스텔"], ["midnight", "미드나잇"]])
      themeSel.append(h("option", { value: v, text: label, selected: settings.theme === v }));
    themeSel.onchange = () => { settings.theme = themeSel.value; saveSettings(); refresh(); };
    body.append(h("div", { class: "gfm-set" }, h("span", { text: "UI 테마" }), h("div", { class: "gfm-row" }, themeSel),
      h("small", { text: "게임 설정의 HUD 스타일 위에 색만 바꿔 입힙니다." })));
    const pos = (run.id && settings.bgPos[run.id]) || { x: 50, y: 42 };
    const slider = (axis, label) => {
      const s = h("input", { type: "range", min: 0, max: 100, step: 1, value: pos[axis], "aria-label": label });
      s.addEventListener("input", () => {
        if (!run.id) return;
        settings.bgPos[run.id] = { ...(settings.bgPos[run.id] || { x: 50, y: 42 }), [axis]: Number(s.value) };
        saveSettings();
        applyLook();
      });
      return h("div", { class: "gfm-set" }, h("span", { text: label }), s);
    };
    const reset = h("button", { class: "gfm-btn", type: "button", text: "기본 위치로" });
    reset.onclick = () => { if (run.id) delete settings.bgPos[run.id]; saveSettings(); applyLook(); openSettings(); };
    body.append(h("h4", { text: "홈 배경 위치 (지금 월드)" }), slider("x", "좌우"), slider("y", "위아래"), reset);
    settingsVeil = sheet("마개조 설정", body, closeSettings);
    arena()?.append(settingsVeil);
  }
  function closeSettings() { settingsVeil?.remove(); settingsVeil = null; }

  /* ═════════════ Album ═════════════ */
  let albumVeil = null, albumOpen = false, albumBody = null;
  function openAlbum() {
    closeAlbum();
    albumOpen = true;
    albumBody = h("div", { class: "gfm-body" });
    albumVeil = sheet("앨범 · 메신저 사진", albumBody, closeAlbum);
    arena()?.append(albumVeil);
    paintAlbum();
  }
  function closeAlbum() { albumVeil?.remove(); albumVeil = null; albumOpen = false; }
  function paintAlbum() {
    if (!albumBody) return;
    const list = (run.id && Array.isArray(album[run.id]) ? album[run.id] : []).slice().reverse();
    if (!list.length) {
      albumBody.replaceChildren(h("div", { class: "gfm-empty", text: "아직 모은 사진이 없어요. 메신저에서 사진을 받으면 여기에 자동으로 모입니다." }));
      return;
    }
    const grid = h("div", { class: "gfm-grid" });
    for (const p of list) {
      const date = new Date(p.at);
      const fig = h("figure", { class: "gfm-shot" }, h("img", { src: p.url, alt: "", loading: "lazy", decoding: "async" }),
        h("figcaption", { text: [p.who, isNaN(date) ? "" : date.toLocaleDateString("ko-KR")].filter(Boolean).join(" · ") }));
      fig.onclick = () => showBig(p);
      grid.append(fig);
    }
    albumBody.replaceChildren(h("div", { class: "gfm-status", text: `${list.length}장 · 이 브라우저에 저장됩니다` }), grid);
  }
  function showBig(p) {
    const forget = h("button", { class: "gfm-btn", type: "button", text: "앨범에서 빼기" });
    const big = h("div", { class: "gfm-big" }, h("img", { src: p.url, alt: "" }),
      h("div", { class: "gfm-row" }, h("a", { class: "gfm-btn", href: p.url, download: "", target: "_blank", rel: "noopener", text: "저장" }), forget));
    big.addEventListener("click", (e) => { if (e.target === big || e.target.tagName === "IMG") big.remove(); });
    forget.onclick = () => {
      const list = album[run.id] || [];
      const i = list.findIndex((x) => x.url === p.url);
      if (i >= 0) list.splice(i, 1);
      writeJson(ALBUM_KEY, album);
      big.remove();
      paintAlbum();
    };
    albumVeil?.append(big);
  }

  /* ═════════════ Shop → "에테르 충전소" (needs the server patch) ═════════════ */
  function headers() {
    const hd = { "X-Marinara-CSRF": "1", "Content-Type": "application/json" };
    try {
      const secret = window.localStorage.getItem("marinara_admin_secret")?.trim();
      if (secret) hd["X-Admin-Secret"] = secret;
    } catch {}
    return hd;
  }
  async function modApi(path, body) {
    let response;
    try {
      response = await fetch(API_BASE + "/gf-mod/" + path, {
        method: "POST", credentials: "same-origin", headers: headers(),
        body: new TextEncoder().encode(JSON.stringify(body || {})), // bytes: other extensions' fetch observers skip it
      });
    } catch { throw Error("서버에 연결하지 못했어요."); }
    if (response.status === 404) throw Error("서버에 마개조 패치가 설치되어 있지 않아요.");
    if (response.status === 401 || response.status === 403) throw Error("서버 권한 확인에 실패했어요.");
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok || !data) throw Error("서버 오류가 났어요 (HTTP " + response.status + ").");
    if (!data.ok) throw Error({ disabled: "서버에서 에테르 충전소가 꺼져 있어요.", "write-conflict": "게임이 같은 순간에 저장 중이었어요. 다시 눌러 주세요.", "bad-request": "월드를 확인하지 못했어요. 게임에서 월드를 다시 열어 주세요." }[data.error] || data.error || "알 수 없는 오류예요.");
    return data;
  }
  const fmt = (n) => Math.max(0, Math.round(Number(n) || 0)).toLocaleString("ko-KR");
  const shop = { open: false, view: null, hidden: [], tab: null, status: null, grid: null, bal: null, packs: null, busy: false };
  const AETHER_CSS = `
.gfm-shop{display:flex;flex-direction:column;gap:var(--sp-2,10px);flex:1 1 auto;min-width:0;min-height:0;overflow:auto}
.gfm-shop .gfm-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.gfm-shop .gfm-head b{font-family:var(--display,inherit);font-size:var(--t-md,15px);letter-spacing:.08em}
.gfm-shop .gfm-head span{color:var(--steel-faint,#8AA2BC);font-size:var(--t-xs,12px)}
.gfm-packs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.gfm-pack{display:flex;flex-direction:column;gap:6px;padding:14px 12px;border-radius:6px;background:var(--surface,#EDF1F6);color:var(--on-surface,#23374F);border-top:3px solid var(--amber,#F0B429)}
.gfm-pack .gfm-amt{font-family:var(--display,inherit);font-size:var(--t-lg,20px);font-weight:800;color:var(--amber-deep,#B8860B)}
.gfm-pack .gfm-lbl{font-size:var(--t-xs,12px);opacity:.8}
.gfm-pack button{margin-top:auto;cursor:pointer;font:inherit;font-weight:800;padding:8px;border:0;border-radius:4px;background:var(--coral,#F2603C);color:var(--on-coral,#fff)}
.gfm-pack button[disabled]{opacity:.5;cursor:default}
.gfm-pack s{opacity:.6;font-size:var(--t-tiny,11px)}`;
  function buildShopView() {
    shop.bal = h("span");
    shop.status = h("div", { class: "gfm-status", role: "status" });
    shop.grid = h("div", { class: "gfm-packs" });
    shop.view = h("div", { class: "gfm-shop", "data-gfm": "" }, h("style", { text: AETHER_CSS }),
      h("div", { class: "gfm-head" }, h("b", { text: "에테르 충전소" }), h("span", { text: "결제는 없어요. 누르면 바로 충전됩니다." }), shop.bal),
      shop.grid, shop.status);
  }
  function paintPacks() {
    shop.grid.replaceChildren();
    for (const p of shop.packs || []) {
      const b = h("button", { type: "button", text: "충전하기", disabled: shop.busy });
      b.onclick = () => charge(p);
      shop.grid.append(h("div", { class: "gfm-pack" }, h("span", { class: "gfm-amt", text: "✦ " + fmt(p.amount) }),
        h("span", { class: "gfm-lbl", text: p.label || "" }), p.price ? h("s", { text: p.price }) : null, b));
    }
  }
  async function loadPacks() {
    shop.status.textContent = "충전소를 여는 중이에요…";
    try {
      const s = await modApi("status");
      shop.packs = s.aether?.enabled ? s.aether.packs || [] : [];
      shop.status.textContent = s.aether?.enabled ? "" : "서버에서 에테르 충전소가 꺼져 있어요.";
    } catch (e) { shop.packs = []; shop.status.textContent = e.message; }
    paintPacks();
  }
  async function charge(p) {
    if (shop.busy) return;
    if (!run.id) { shop.status.textContent = "월드를 아직 확인하지 못했어요. 홈으로 갔다가 다시 와 주세요."; return; }
    shop.busy = true;
    paintPacks();
    shop.status.textContent = "충전하는 중이에요…";
    try {
      const done = await modApi("aether/charge", { runId: run.id, pack: p.id });
      const total = Number(done.wallet?.aether);
      shop.status.textContent = `에테르 ${fmt(done.added)} 충전 완료!` + (Number.isFinite(total) ? ` 지금 ${fmt(total)}` : "");
      if (Number.isFinite(total)) mirrorAether(total);
    } catch (e) { shop.status.textContent = e.message; }
    shop.busy = false;
    paintPacks();
  }
  // Keep the top bar honest until the game's next refresh.
  function mirrorAether(total) {
    const cur = q(".currency.aet");
    if (!cur) return;
    const walker = document.createTreeWalker(cur, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode())
      if (/\d/.test(n.nodeValue)) { n.nodeValue = n.nodeValue.replace(/[\d,]+/, total.toLocaleString("en-US")); break; }
  }
  function restoreShop() {
    for (const [n, value, priority] of shop.hidden) if (n.isConnected) n.style.setProperty("display", value, priority);
    shop.hidden = [];
    shop.view?.remove();
    if (shop.tab?.isConnected) shop.tab.classList.remove("on");
  }
  function applyShop() {
    const screen = q('[data-screen="shop"]');
    const rail = screen?.querySelector(".sh-rail"), pane = screen?.querySelector(".sh-pane");
    if (!rail || !pane) { if (shop.open) { shop.open = false; restoreShop(); } return; }
    if (!shop.tab || !rail.contains(shop.tab)) {
      shop.tab = h("button", { class: "sh-cat", type: "button", "data-gfm-tab": "" }, h("span", { class: "sh-cat-nm", text: "에테르 충전소" }), h("span", { class: "sh-cat-n", text: "마개조" }));
      shop.tab.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (shop.open) return;
        shop.open = true;
        if (!shop.view) buildShopView();
        applyShop();
        loadPacks();
      });
      rail.append(shop.tab);
      // Any of the game's own tabs hands the pane back untouched.
      rail.addEventListener("click", (e) => {
        if (e.target.closest?.("[data-gfm-tab]")) return;
        if (shop.open) { shop.open = false; restoreShop(); }
      }, { capture: true });
    }
    if (!shop.open) return;
    if (shop.view.parentNode !== pane) {
      restoreShop();
      for (const n of [...pane.children]) {
        if (n === shop.view) continue;
        shop.hidden.push([n, n.style.getPropertyValue("display"), n.style.getPropertyPriority("display")]);
        n.style.setProperty("display", "none", "important");
      }
      pane.append(shop.view);
    }
    for (const n of rail.children) if (n !== shop.tab && n.classList.contains("on")) n.classList.remove("on");
    shop.tab.classList.add("on");
  }

  /* ═════════════ Loop ═════════════ */
  function refresh() {
    if (disposed) return;
    applyLook();
    ensureDock();
    applyGroups();
    applyShop();
    paintDock();
  }
  let scheduled = false, observer = null, observed = null;
  const schedule = () => {
    if (scheduled || disposed) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; refresh(); }, 120);
  };
  function observe() {
    const r = shadow();
    if (!r || r === observed) return;
    observer?.disconnect();
    observed = r;
    observer = new MutationObserver((records) => {
      for (const rec of records) {
        const t = rec.target;
        if (t.nodeType === 1 && t.closest?.("[data-gfm]")) continue; // our own pieces
        if (t === styleEl) continue;
        return schedule();
      }
    });
    observer.observe(r, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-screen", "data-style", "hidden", "class"] });
  }
  const timer = setInterval(() => {
    if (disposed) return;
    observe();
    if (auto.mode) autoStep();
    refresh();
  }, 700);
  observe();
  refresh();

  window[KEY] = () => {
    if (disposed) return;
    disposed = true;
    if (window.fetch === observedFetch) window.fetch = priorFetch;
    clearInterval(timer);
    observer?.disconnect();
    closeSettings();
    closeAlbum();
    dock?.remove();
    styleEl?.remove();
    restoreShop();
    shop.tab?.remove();
    const r = shadow();
    if (r) {
      for (const n of r.querySelectorAll(".gfm-grp")) n.remove();
      for (const n of r.querySelectorAll(".gfm-folded")) n.classList.remove("gfm-folded");
      for (const n of r.querySelectorAll("[data-gfm-theme]")) n.removeAttribute("data-gfm-theme");
    }
    delete window[KEY];
  };
})();
