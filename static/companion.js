/* ---------------------------------------------------------------
   页面小伙伴：大肥鱼
   外观来自 static/companion/sprites.webp（由 tools/build_sprites.py 从 raw/ 打包），
   这里负责播放帧动画和行为：
   - 走路：播放走路循环，并按步幅同步移动，走到屏幕边缘停一下再转身
   - 闲逛：随机停下来歇脚、东张西望（待机动画里自带眨眼和呼吸）
   - 鼠标靠近：停下来，转身看向你
   - 点击：轮流做三种反应 —— 鞠躬 / 原地转圈 / 挥手
   - 按住拖动：把她拎起来（会蹬腿挣扎），松手后掉回地面
   可调参数见下方 CONFIG。
---------------------------------------------------------------- */
(() => {
  const CONFIG = {
    name: "大肥鱼",
    size: 160,          // 显示尺寸（像素），手机上自动缩小
    mobileSize: 120,
    gravity: 2200,      // 松手后下落的重力
    stride: 31,         // 走路时每帧脚步移动的距离（原图 512 像素坐标），用来让移动速度和步伐对上
    lines: {
      bow: ["请多指教～", "欢迎来玩～", "今天也请多关照"],
      spin: ["转个圈～", "看我的裙子！", "晕乎乎…"],
      wave: ["你好呀！", "今天也辛苦啦", "要不要歇一会？"],
      grab: ["放我下来～", "哇啊啊！", "好高！"],
      land: ["哎哟。", "安全着陆！", "头好晕…"],
    },
  };
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const base = new URL("companion/", document.currentScript.src);

  /* ================= 样式 ================= */
  const CSS = `
.companion { position: fixed; left: 0; bottom: 0; z-index: 35; width: ${CONFIG.size}px; height: ${CONFIG.size}px;
  pointer-events: none; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
.companion[hidden] { display: none; }
.cp-hit { position: absolute; left: 26%; right: 26%; top: 20%; bottom: 4%; pointer-events: auto; cursor: grab; touch-action: none; border-radius: 40%; }
.companion[data-state="held"] .cp-hit { cursor: grabbing; }
.cp-hit:focus-visible { outline: 2px dashed var(--accent, #c2412d); outline-offset: 2px; }
.cp-dir { width: 100%; height: 100%; }
.companion.left .cp-dir { transform: scaleX(-1); }
.cp-sprite { width: 100%; height: 100%; background-repeat: no-repeat;
  filter: drop-shadow(0 6px 6px rgba(30, 30, 60, .16)); }
.cp-shadow { position: absolute; left: 34%; right: 34%; bottom: 4%; height: 6px; border-radius: 50%; background: rgba(0, 0, 0, .14);
  transition: opacity .2s; }
.companion:is([data-state="held"], [data-state="fall"]) .cp-shadow { opacity: 0; }

/* 对白气泡 */
.cp-say { position: absolute; left: 50%; bottom: 82%; transform: translate(-50%, 6px); opacity: 0;
  white-space: nowrap; pointer-events: none; font: 13px/1.4 var(--sans, sans-serif);
  color: var(--ink, #23201b); background: var(--surface, #fff); border: 1px solid var(--ink, #23201b);
  padding: 4px 11px; border-radius: 12px; transition: opacity .2s, transform .25s cubic-bezier(.34, 1.56, .64, 1); }
.cp-say::after { content: ""; position: absolute; left: 50%; top: 100%; width: 7px; height: 7px; background: inherit;
  border-right: 1px solid var(--ink, #23201b); border-bottom: 1px solid var(--ink, #23201b); transform: translate(-50%, -3.5px) rotate(45deg); }
.cp-say.show { opacity: 1; transform: translate(-50%, 0); }

/* 特效粒子 */
.cp-fx { position: fixed; inset: 0; pointer-events: none; z-index: 36; overflow: hidden; }
.cp-fx > * { position: absolute; }
.cp-spark { width: 14px; height: 14px; margin: -7px 0 0 -7px; color: #f2b632; animation: cp-spark .75s ease-out var(--delay) both; }
@keyframes cp-spark { 0% { transform: translate(0, 0) scale(0) rotate(0); } 40% { transform: translate(var(--dx), var(--dy)) scale(1.1) rotate(60deg); opacity: 1; }
  100% { transform: translate(var(--dx), var(--dy)) scale(0) rotate(120deg); opacity: 0; } }
.cp-heart { width: 18px; height: 18px; margin: -9px 0 0 -9px; color: #ff6f8e; animation: cp-heart 1.5s ease-out both; }
@keyframes cp-heart { 0% { transform: translateY(0) scale(0); } 15% { transform: translateY(-6px) scale(1.25); }
  30% { transform: translate(-6px, -22px) scale(1); } 60% { transform: translate(6px, -48px); opacity: 1; } 100% { transform: translate(-4px, -78px); opacity: 0; } }
.cp-dust { width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: var(--ink-3, #b9b0a0); opacity: .6; animation: cp-dust .55s ease-out both; }
@keyframes cp-dust { from { transform: translate(0, 0) scale(.5); opacity: .7; } to { transform: translate(var(--dx), -8px) scale(1.6); opacity: 0; } }

@media (max-width: 560px) { .companion { width: ${CONFIG.mobileSize}px; height: ${CONFIG.mobileSize}px; } }
`;

  /* ================= 搭建 DOM ================= */
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = document.createElement("div");
  el.className = "companion";
  el.hidden = true;                       // 素材加载完再出现
  el.innerHTML = `<div class="cp-shadow"></div><div class="cp-dir"><div class="cp-sprite"></div></div>
    <div class="cp-hit" tabindex="0" role="button" aria-label="${CONFIG.name}：点一下和她互动，按住可以拖动"></div>
    <div class="cp-say" aria-live="polite"></div>`;
  document.body.appendChild(el);
  const fx = document.createElement("div");
  fx.className = "cp-fx";
  fx.setAttribute("aria-hidden", "true");
  document.body.appendChild(fx);

  const sprite = el.querySelector(".cp-sprite");
  const hit = el.querySelector(".cp-hit");
  const bubble = el.querySelector(".cp-say");
  const size = () => el.offsetWidth || CONFIG.size;

  /* ================= 帧动画播放器 ================= */
  let SHEET = null;
  let anim = null, animName = "", frameIdx = 0, frameClock = 0, onAnimEnd = null;

  function play(name, done = null) {
    if (name === animName && SHEET.actions[name].loop) return;   // 正在播的循环动画不用重头播
    animName = name;
    anim = SHEET.actions[name];
    frameIdx = 0;
    frameClock = 0;
    onAnimEnd = done;
    drawFrame();
  }
  function drawFrame() {
    const col = anim.frames[frameIdx];
    const x = SHEET.columns > 1 ? (col / (SHEET.columns - 1)) * 100 : 0;
    const y = SHEET.rows > 1 ? (anim.row / (SHEET.rows - 1)) * 100 : 0;
    sprite.style.backgroundPosition = `${x}% ${y}%`;
  }
  function stepAnim(dtMs) {
    frameClock += dtMs;
    while (frameClock >= anim.ms) {
      frameClock -= anim.ms;
      if (frameIdx < anim.frames.length - 1) frameIdx++;
      else if (anim.loop) frameIdx = 0;
      else {                                  // 单次动画播完：回调（通常切回走路）
        frameClock = 0;
        const cb = onAnimEnd;
        onAnimEnd = null;
        if (cb) cb();
        return drawFrame();
      }
    }
    drawFrame();
  }

  /* ================= 状态 ================= */
  let x = 0, lift = 0, vy = 0, dir = 1;
  let state = "", until = 0, hovering = false, grab = null, bubbleTimer = 0;
  let reactionTurn = Math.floor(Math.random() * 3);

  const ANIM_OF = { walk: "walk", rest: "idle", look: "idle", turn: "idle", held: "held", fall: "fall" };
  function setState(next, ms = 0) {
    state = next;
    el.dataset.state = next;
    until = ms ? performance.now() + ms : 0;
    if (ANIM_OF[next]) play(ANIM_OF[next]);
  }
  function face(d) { dir = d; el.classList.toggle("left", d < 0); }
  function say(text, ms = 1700) {
    bubble.textContent = text;
    bubble.classList.add("show");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove("show"), ms);
  }
  const settle = () => setState(hovering ? "look" : "walk");
  // 原图里脚底在 512 画布的 y≈486 处，往下挪一点让脚贴住屏幕底边
  const groundOffset = () => size() * (24 / 512);
  // 和步幅匹配的行走速度（像素/秒）
  const walkSpeed = () => CONFIG.stride * (size() / SHEET.source) / (SHEET.actions.walk.ms / 1000);

  /* ================= 主循环 ================= */
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(now - last, 50);
    last = now;
    const s = dt / 1000;
    const maxX = Math.max(0, innerWidth - size());
    const maxLift = Math.max(0, innerHeight - size());

    switch (state) {
      case "walk":
        x += dir * walkSpeed() * s;
        if ((x <= 0 && dir < 0) || (x >= maxX && dir > 0)) setState("turn", 600);
        else if (Math.random() < s * 0.06) setState("rest", 2200 + Math.random() * 2600);
        break;
      case "turn":
        if (now >= until) { face(-dir); setState("walk"); }
        break;
      case "rest":
        if (now >= until) { if (Math.random() < 0.35) face(-dir); setState("walk"); }
        else if (Math.random() < s * 0.3) face(-dir);   // 东张西望
        break;
      case "fall":
        vy -= CONFIG.gravity * s;
        lift += vy * s;
        if (lift <= 0) { lift = 0; land(); }
        break;
    }
    stepAnim(dt);

    x = Math.min(Math.max(x, 0), maxX);
    lift = Math.min(Math.max(lift, 0), maxLift);
    el.style.transform = `translate3d(${x}px, ${groundOffset() - lift}px, 0)`;
    requestAnimationFrame(tick);
  }

  /* ================= 特效 ================= */
  function spawn(cls, left, top, vars = {}, inner = "") {
    if (calm) return;
    const node = document.createElement("span");
    node.className = cls;
    node.style.left = left + "px";
    node.style.top = top + "px";
    for (const k in vars) node.style.setProperty(k, vars[k]);
    node.innerHTML = inner;
    fx.appendChild(node);
    node.addEventListener("animationend", (e) => { if (e.target === node) node.remove(); });
    setTimeout(() => node.remove(), 3000);
  }
  // 原图坐标（512×512，面朝右）→ 屏幕坐标
  function point(px, py) {
    const r = el.getBoundingClientRect();
    const fx_ = dir < 0 ? SHEET.source - px : px;
    return [r.left + (fx_ / SHEET.source) * r.width, r.top + (py / SHEET.source) * r.height];
  }
  const STAR = '<svg viewBox="0 0 20 20" width="100%" height="100%"><path d="M10 0 L12.4 7.6 L20 10 L12.4 12.4 L10 20 L7.6 12.4 L0 10 L7.6 7.6 Z" fill="currentColor"/></svg>';
  function sparkles() {
    const [cx, cy] = point(256, 300);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
      const d = 52 + Math.random() * 24;
      spawn("cp-spark", cx, cy, { "--dx": Math.cos(a) * d + "px", "--dy": Math.sin(a) * d * 0.8 + "px", "--delay": i * 0.04 + "s" }, STAR);
    }
  }
  const HEART = '<svg viewBox="0 0 20 18" width="100%" height="100%"><path d="M10 17 C4 12 0 9 0 5 C0 2 2.3 0 5 0 C7 0 8.8 1.2 10 3 C11.2 1.2 13 0 15 0 C17.7 0 20 2 20 5 C20 9 16 12 10 17 Z" fill="currentColor"/></svg>';
  function heart() {
    const [hx, hy] = point(330, 150);
    spawn("cp-heart", hx, hy, {}, HEART);
  }
  function dust() {
    const [fx_, fy] = point(256, 486);
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      spawn("cp-dust", fx_ + side * (8 + i * 5), fy, { "--dx": side * (22 + i * 12) + "px" });
    }
  }

  /* ================= 互动 ================= */
  const reactions = [
    () => { setState("bow"); say(pick(CONFIG.lines.bow)); play("bow", settle); setTimeout(heart, 500); },
    () => { setState("spin"); say(pick(CONFIG.lines.spin)); play("spin", settle); setTimeout(sparkles, 300); },
    () => { setState("wave"); say(pick(CONFIG.lines.wave)); play("wave", settle); setTimeout(heart, 250); setTimeout(heart, 700); },
  ];
  const busy = () => ["bow", "spin", "wave", "held", "fall", "land"].includes(state);
  function react() {
    if (!SHEET || busy()) return;
    reactions[reactionTurn++ % reactions.length]();
  }
  function land() {
    setState("land");
    play("land", settle);
    say(pick(CONFIG.lines.land), 1300);
    dust();
  }

  hit.addEventListener("pointerenter", (e) => {
    hovering = true;
    if (["walk", "rest", "turn"].includes(state)) {
      setState("look");
      const r = el.getBoundingClientRect();
      face(e.clientX < r.left + r.width / 2 ? -1 : 1);
    }
  });
  hit.addEventListener("pointerleave", () => {
    hovering = false;
    if (state === "look") setState("walk");
  });
  hit.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || state === "fall" || !SHEET) return;
    e.preventDefault();
    try { hit.setPointerCapture(e.pointerId); } catch (_) {}
    const r = el.getBoundingClientRect();
    grab = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, dragging: false };
  });
  hit.addEventListener("pointermove", (e) => {
    if (!grab || e.pointerId !== grab.id) return;
    if (!grab.dragging && Math.hypot(e.clientX - grab.sx, e.clientY - grab.sy) > 6) {
      grab.dragging = true;
      setState("held");
      say(pick(CONFIG.lines.grab), 2200);
    }
    if (grab.dragging) {
      x = e.clientX - grab.ox;
      lift = innerHeight - (e.clientY - grab.oy) - size() + groundOffset();
    }
  });
  function release(e) {
    if (!grab || e.pointerId !== grab.id) return;
    const wasDragging = grab.dragging;
    grab = null;
    if (wasDragging) {
      vy = 0;
      if (lift > 2) setState("fall"); else land();
    } else if (e.type === "pointerup") {
      react();
    }
  }
  hit.addEventListener("pointerup", release);
  hit.addEventListener("pointercancel", release);
  hit.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); react(); }
  });

  /* ================= 收起 / 放出 ================= */
  const KEY = "companion-hidden";
  const toggles = document.querySelectorAll("[data-companion-toggle]");
  let hidden = false;
  try { hidden = localStorage.getItem(KEY) === "1"; } catch (_) {}
  function applyHidden() {
    el.hidden = hidden || !SHEET;
    fx.hidden = hidden;
    toggles.forEach((b) => (b.textContent = hidden ? "叫小伙伴回来" : "收起小伙伴"));
  }
  applyHidden();
  toggles.forEach((b) => b.addEventListener("click", () => {
    hidden = !hidden;
    applyHidden();
    try { localStorage.setItem(KEY, hidden ? "1" : "0"); } catch (_) {}
    if (!hidden && SHEET) { lift = innerHeight * 0.5; vy = 0; setState("fall"); }
  }));

  /* ================= 加载素材后启动 ================= */
  (async () => {
    try {
      const meta = await (await fetch(new URL("sprites.json", base))).json();
      const img = new Image();
      img.src = new URL("sprites.webp", base).href;
      await img.decode();
      SHEET = meta;
      sprite.style.backgroundImage = `url("${img.src}")`;
      sprite.style.backgroundSize = `${meta.columns * 100}% ${meta.rows * 100}%`;
      applyHidden();
      x = Math.random() * Math.max(0, innerWidth - size());
      face(Math.random() < 0.5 ? -1 : 1);
      setState("walk");
      last = performance.now();
      requestAnimationFrame(tick);
    } catch (err) {
      console.warn("小伙伴素材加载失败（需要通过本地服务器或网站访问）：", err);
    }
  })();
})();
