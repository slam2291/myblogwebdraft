/* ---------------------------------------------------------------
   旁注 · 交互效果
   悬停：阴阳鱼光标，移动时留下渐隐的阴阳鱼虚影；指向可点的内容会变大转快，卡片上显示「展卷」，
         卡片 3D 倾斜与高光、按钮磁吸
   点击：八卦环从点击处展开旋转淡去（每三次一次朱砂）、按钮/卡片涟漪、印章重盖、太极加速旋转、
         站内跳转时墨色圆形转场、切换深浅色时圆形展开
   其他：滚动入场动画、阅读进度、目录高亮、回到顶部
---------------------------------------------------------------- */
(() => {
  const root = document.documentElement;
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const css = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ========== 入场动画 ========== */
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      }), { threshold: 0.12, rootMargin: "0px 0px -40px 0px" })
    : null;
  const reveal = () => document.querySelectorAll("[data-reveal]:not(.in)").forEach((el) => (io ? io.observe(el) : el.classList.add("in")));
  reveal();
  document.addEventListener("content:ready", reveal);

  /* ========== 画太极（光标拖尾和点击特效共用） ========== */
  function drawTaiji(c, x, y, R, rot, alpha, ink, paper) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.globalAlpha = alpha;
    c.fillStyle = paper;
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fill();
    c.fillStyle = ink;
    c.beginPath();
    c.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false);           // 右半边大弧
    c.arc(0, R / 2, R / 2, Math.PI / 2, Math.PI * 1.5, false);  // 下半个小弧（鼓向左）
    c.arc(0, -R / 2, R / 2, Math.PI / 2, -Math.PI / 2, true);   // 上半个小弧（凹向右）
    c.fill();
    c.beginPath(); c.arc(0, -R / 2, R * 0.15, 0, Math.PI * 2); c.fill();
    c.fillStyle = paper;
    c.beginPath(); c.arc(0, R / 2, R * 0.15, 0, Math.PI * 2); c.fill();
    c.strokeStyle = ink; c.lineWidth = Math.max(0.8, R * 0.09);
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.stroke();
    c.restore();
  }

  /* ========== 自定义光标：阴阳鱼 + 阴阳鱼虚影拖尾 ========== */
  if (finePointer && !calm) {
    root.classList.add("has-cursor");
    const cur = document.createElement("div");
    cur.className = "cursor";
    cur.setAttribute("aria-hidden", "true");
    cur.innerHTML = `
      <svg class="cur-taiji" viewBox="-12 -12 24 24">
        <circle r="11" class="t-yang"/><path class="t-yin" d="M0-11a11 11 0 0 1 0 22a5.5 5.5 0 0 1 0-11a5.5 5.5 0 0 0 0-11z"/>
        <circle cy="-5.5" r="1.9" class="t-yin"/><circle cy="5.5" r="1.9" class="t-yang"/><circle r="11" class="t-edge"/>
      </svg>
      <span class="cur-label"></span>`;
    document.body.appendChild(cur);
    const label = cur.querySelector(".cur-label");

    const trail = document.createElement("canvas");
    trail.className = "trail-layer";
    trail.setAttribute("aria-hidden", "true");
    document.body.appendChild(trail);
    const tctx = trail.getContext("2d");
    const fitTrail = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      trail.width = innerWidth * dpr; trail.height = innerHeight * dpr;
      trail.style.width = innerWidth + "px"; trail.style.height = innerHeight + "px";
      tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fitTrail();
    addEventListener("resize", fitTrail);

    const LIFE = 620;          // 虚影多久淡完（毫秒）
    const SPACING = 26;        // 每移动多少像素留下一个虚影
    const ghosts = [];
    let trailOn = false, ink = css("--ink"), paper = css("--surface");
    let lastX = null, lastY = null, travelled = 0, spin = 0;

    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const x = e.clientX, y = e.clientY;
      cur.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      root.classList.add("cursor-visible");
      updateHover(e.target);
      if (lastX !== null) {
        const d = Math.hypot(x - lastX, y - lastY);
        travelled += d;
        spin += d * 0.03;
        if (travelled >= SPACING && d < 200) {
          travelled = 0;
          ghosts.push({ x, y, t: performance.now(), rot: spin, size: Math.min(11, 7 + d * 0.15) });
          if (ghosts.length > 40) ghosts.shift();
          if (!trailOn) { trailOn = true; ink = css("--ink"); paper = css("--surface"); requestAnimationFrame(drawTrail); }
        }
      }
      lastX = x; lastY = y;
    }, { passive: true });

    function drawTrail(now) {
      tctx.clearRect(0, 0, innerWidth, innerHeight);
      while (ghosts.length && now - ghosts[0].t > LIFE) ghosts.shift();
      for (const g of ghosts) {
        const k = 1 - (now - g.t) / LIFE;                 // 1 → 0
        drawTaiji(tctx, g.x, g.y, g.size * (0.45 + 0.55 * k), g.rot + (1 - k) * 2.2, 0.38 * k * k, ink, paper);
      }
      if (ghosts.length) requestAnimationFrame(drawTrail);
      else { trailOn = false; tctx.clearRect(0, 0, innerWidth, innerHeight); }
    }

    document.addEventListener("pointerleave", () => { root.classList.remove("cursor-visible"); lastX = null; });
    addEventListener("blur", () => { root.classList.remove("cursor-visible"); lastX = null; });
    // 指向不同内容：可点的东西 → 变大、转快、出现朱砂圈；卡片 →「展卷」；小伙伴 →「摸摸」；图片 →「细看」
    let hoverEl;
    function updateHover(target) {
      const el = target && target.closest ? target.closest("a, button, [data-cursor], .companion, .prose img, .taiji") : null;
      if (el === hoverEl) return;
      hoverEl = el;
      let text = "";
      if (el) text = el.dataset.cursor || (el.closest(".companion") ? "摸摸" : el.matches(".prose img") ? "细看" : el.matches(".taiji") ? "转动" : "");
      cur.classList.toggle("is-hover", Boolean(el));
      cur.classList.toggle("is-label", Boolean(text));
      if (text) label.textContent = text;
    }
    // 进入元素时更新；每次移动也再确认一次，避免漏掉事件（例如被浏览器插件拦截）后光标状态卡住
    document.addEventListener("pointerover", (e) => updateHover(e.target));
    addEventListener("scroll", () => { if (lastX !== null) updateHover(document.elementFromPoint(lastX, lastY)); }, { passive: true });
    addEventListener("pointerdown", () => cur.classList.add("is-down"));
    addEventListener("pointerup", () => cur.classList.remove("is-down"));
  }

  /* ========== 卡片倾斜 / 按钮磁吸 ========== */
  if (finePointer && !calm) {
    let tiltEl = null, magEl = null;
    const resetTilt = (el) => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); };
    const resetMag = (el) => { el.style.transition = "transform .6s cubic-bezier(.34,1.56,.64,1)"; el.style.transform = ""; };

    document.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const t = e.target.closest("[data-tilt]");
      if (tiltEl && tiltEl !== t) resetTilt(tiltEl);
      tiltEl = t;
      if (t) {
        const r = t.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        const strength = r.width > 600 ? 3 : 7;           // 大卡片倾斜得少一点
        t.style.setProperty("--ry", `${(px - 0.5) * strength}deg`);
        t.style.setProperty("--rx", `${(0.5 - py) * strength}deg`);
        t.style.setProperty("--mx", `${e.clientX - r.left}px`);
        t.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
      const m = e.target.closest("[data-magnetic], .theme-toggle");
      if (magEl && magEl !== m) resetMag(magEl);
      magEl = m;
      if (m) {
        const r = m.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        m.style.transition = "transform .15s linear";
        m.style.transform = `translate(${dx * 0.28}px, ${dy * 0.36}px)`;
      }
    }, { passive: true });
    document.addEventListener("pointerleave", () => {
      if (tiltEl) resetTilt(tiltEl);
      if (magEl) resetMag(magEl);
      tiltEl = magEl = null;
    });
  }

  /* ========== 点击：八卦环 ========== */
  const canvas = document.createElement("canvas");
  canvas.className = "ink-layer";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const splashes = [];
  let running = false, last = 0, colorTurn = 0;
  const fit = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    // 画布像素按屏幕缩放放大，但显示尺寸必须固定为视口大小，否则高分屏上墨花会偏离鼠标
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + "px"; canvas.style.height = innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  addEventListener("resize", fit);

  // 点击：八卦环从点击处向外展开、旋转、淡去，中心一个阴阳鱼快速一转
  const BAGUA = ["111", "011", "010", "001", "000", "100", "101", "110"];   // 乾巽坎艮坤震离兑（自下而上）
  function splash(x, y, scale = 1) {
    if (calm) return;
    const red = colorTurn++ % 3 === 2;                 // 每三次有一次朱砂色
    splashes.push({ x, y, t: 0, scale, red, rot0: Math.random() * Math.PI * 2, dir: Math.random() < 0.5 ? -1 : 1 });
    if (!running) { running = true; last = 0; requestAnimationFrame(frame); }
  }

  function frame(now) {
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const ink = css("--ink"), paper = css("--surface"), accent = css("--accent");
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i];
      s.t += dt;
      const p = s.t / 0.85;
      if (p >= 1) { splashes.splice(i, 1); continue; }
      const out = 1 - Math.pow(1 - p, 3);                // 先快后慢地展开
      const fade = p < 0.35 ? 1 : 1 - (p - 0.35) / 0.65;
      const sc = s.scale;
      const color = s.red ? accent : ink;

      // 外圈细线
      ctx.save();
      ctx.globalAlpha = 0.5 * fade;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(s.x, s.y, (14 + 46 * out) * sc, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // 八卦：三爻一组，第一爻朝里
      const r = (10 + 30 * out) * sc;
      const len = 11 * sc, th = 2.1 * sc, gap = 3.6 * sc, half = len / 2;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot0 + s.dir * out * 0.9);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85 * fade;
      for (let k = 0; k < 8; k++) {
        ctx.save();
        ctx.rotate((k * Math.PI) / 4);
        for (let n = 0; n < 3; n++) {
          const yy = -(r + n * gap);
          if (BAGUA[k][n] === "1") ctx.fillRect(-half, yy - th / 2, len, th);
          else { ctx.fillRect(-half, yy - th / 2, len * 0.4, th); ctx.fillRect(half - len * 0.4, yy - th / 2, len * 0.4, th); }
        }
        ctx.restore();
      }
      ctx.restore();

      // 中心阴阳鱼：一闪一转
      const tr = (6 + 4 * Math.sin(Math.min(1, p * 2) * Math.PI)) * sc;
      drawTaiji(ctx, s.x, s.y, tr, s.rot0 + p * Math.PI * 2.5 * s.dir, Math.max(0, 1 - p * 1.6), ink, paper);
    }
    ctx.globalAlpha = 1;
    if (splashes.length) requestAnimationFrame(frame);
    else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".companion")) return;   // 小伙伴有自己的反应
    splash(e.clientX, e.clientY);
    // 卡片、按钮、标签的涟漪
    const host = e.target.closest(".card, .btn, .chip");
    if (host && !calm) {
      const r = host.getBoundingClientRect();
      const rip = document.createElement("span");
      rip.className = "ripple";
      rip.style.left = e.clientX - r.left + "px";
      rip.style.top = e.clientY - r.top + "px";
      host.appendChild(rip);
      rip.addEventListener("animationend", () => rip.remove());
    }
  });

  /* ========== 太极：点一下转得更快 ========== */
  const taiji = document.getElementById("taiji");
  if (taiji) taiji.addEventListener("click", (e) => {
    taiji.classList.remove("spin");
    void taiji.getBBox();
    taiji.classList.add("spin");
    const ring = document.getElementById("bagua-ring");
    if (ring && ring.animate && !calm) ring.animate([{ rotate: "0deg" }, { rotate: "-90deg" }], { duration: 1400, easing: "cubic-bezier(.22,1,.36,1)", composite: "add" });
    if (taiji.animate && !calm) taiji.animate([{ rotate: "0deg" }, { rotate: "360deg" }], { duration: 1400, easing: "cubic-bezier(.22,1,.36,1)", composite: "add" });
  });

  /* ========== 印章：点一下重新盖章 ========== */
  const stamp = document.querySelector(".stamp");
  if (stamp) stamp.addEventListener("click", () => {
    stamp.classList.remove("again");
    void stamp.offsetWidth;
    stamp.classList.add("again");
    const r = stamp.getBoundingClientRect();
    setTimeout(() => splash(r.left + r.width / 2, r.top + r.height / 2, 1.6), 260);
  });

  /* ========== 深浅色切换（圆形展开） ========== */
  const toggle = document.querySelector(".theme-toggle");
  if (toggle) toggle.addEventListener("click", (e) => {
    const dark = root.dataset.pzTheme ? root.dataset.pzTheme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const apply = () => {
      root.dataset.pzTheme = dark ? "light" : "dark";
      try { localStorage.setItem("theme", root.dataset.pzTheme); } catch (_) {}
    };
    if (!document.startViewTransition || calm) return apply();
    const x = e.clientX || innerWidth - 40, y = e.clientY || 40;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(apply).ready.then(() => {
      root.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 650, easing: "cubic-bezier(.7,0,.3,1)", pseudoElement: "::view-transition-new(root)" });
    });
  });

  /* ========== 站内跳转转场 ========== */
  if (!calm) {
    // 进入页面的收拢动画由 CSS 播放，这里只在结束后清掉标记
    if (root.classList.contains("wipe-in")) setTimeout(() => root.classList.remove("wipe-in"), 800);
    const wipe = document.createElement("div");
    wipe.className = "page-wipe";
    document.body.appendChild(wipe);
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target && a.target !== "_self") return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return; // 页内锚点
      e.preventDefault();
      wipe.style.setProperty("--x", e.clientX + "px");
      wipe.style.setProperty("--y", e.clientY + "px");
      wipe.classList.add("is-covering");
      try { sessionStorage.setItem("wipe", "1"); } catch (_) {}
      setTimeout(() => (location.href = url.href), 480);
    });
    // 从浏览器“后退”回来时，把遮罩收起
    addEventListener("pageshow", (e) => { if (e.persisted) wipe.classList.remove("is-covering"); });
  }

  /* ========== 滚动相关：进度条 / 回到顶部 / 目录高亮 ========== */
  const bar = document.querySelector(".progress");
  const toTop = document.querySelector(".to-top");
  const ringCircle = toTop && toTop.querySelector("circle");
  function onScroll() {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, scrollY / max) : 0;
    if (bar) bar.style.transform = `scaleX(${p})`;
    if (toTop) {
      toTop.classList.toggle("show", scrollY > 480);
      ringCircle.style.strokeDashoffset = 1 - p;
    }
    const links = document.querySelectorAll(".toc a");
    if (links.length) {
      let current = null;
      document.querySelectorAll(".prose h2, .prose h3").forEach((h) => { if (h.getBoundingClientRect().top < 140) current = h.id; });
      links.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === "#" + current));
    }
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  document.addEventListener("content:ready", onScroll);
  onScroll();
  if (toTop) toTop.addEventListener("click", () => scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" }));
})();
