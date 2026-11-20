/* ---------------------------------------------------------------
   旁注 · 站点脚本
   1. SITE：站点名称等基本信息，改这里即可全站生效
   2. 读取 content/list.txt 和 content/*.md，生成首页与文章页
   3. 一个够用的小型 Markdown 渲染器（无第三方依赖）
   4. 易经卦象、干支日期、水墨封面
---------------------------------------------------------------- */
const SITE = {
  name: "旁注",
  mark: "旁",            // 左上角印章里的字
  tagline: "写在页边的字。读书、做东西、走路时想到的事，慢慢记下来。",
};

/* ========== 工具 ========== */
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SLUG_OK = /^[a-z0-9][a-z0-9_-]*$/i;

async function fetchText(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.text();
}

function splitFrontMatter(text) {
  const meta = {};
  const m = text.replace(/^﻿/, "").match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  const body = m ? text.replace(/^﻿/, "").slice(m[0].length) : text;
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  meta.tags = (meta.tags || "").split(/[,，]/).map((t) => t.trim()).filter(Boolean);
  return { meta, body };
}

const readMinutes = (body) => Math.max(1, Math.round(body.replace(/\s+/g, "").length / 400));

/* ========== 易经：八卦与六十四卦 ========== */
// 八卦的三爻，自下而上（1 = 阳爻，0 = 阴爻）
const TRIGRAMS = { 乾: "111", 兑: "110", 离: "101", 震: "100", 巽: "011", 坎: "010", 艮: "001", 坤: "000" };
// 六十四卦：上卦 → 下卦 → [文王卦序, 卦名]
const HEX_TABLE = {
  乾: { 乾: [1, "乾"], 震: [25, "无妄"], 坎: [6, "讼"], 艮: [33, "遁"], 坤: [12, "否"], 巽: [44, "姤"], 离: [13, "同人"], 兑: [10, "履"] },
  震: { 乾: [34, "大壮"], 震: [51, "震"], 坎: [40, "解"], 艮: [62, "小过"], 坤: [16, "豫"], 巽: [32, "恒"], 离: [55, "丰"], 兑: [54, "归妹"] },
  坎: { 乾: [5, "需"], 震: [3, "屯"], 坎: [29, "坎"], 艮: [39, "蹇"], 坤: [8, "比"], 巽: [48, "井"], 离: [63, "既济"], 兑: [60, "节"] },
  艮: { 乾: [26, "大畜"], 震: [27, "颐"], 坎: [4, "蒙"], 艮: [52, "艮"], 坤: [23, "剥"], 巽: [18, "蛊"], 离: [22, "贲"], 兑: [41, "损"] },
  坤: { 乾: [11, "泰"], 震: [24, "复"], 坎: [7, "师"], 艮: [15, "谦"], 坤: [2, "坤"], 巽: [46, "升"], 离: [36, "明夷"], 兑: [19, "临"] },
  巽: { 乾: [9, "小畜"], 震: [42, "益"], 坎: [59, "涣"], 艮: [53, "渐"], 坤: [20, "观"], 巽: [57, "巽"], 离: [37, "家人"], 兑: [61, "中孚"] },
  离: { 乾: [14, "大有"], 震: [21, "噬嗑"], 坎: [64, "未济"], 艮: [56, "旅"], 坤: [35, "晋"], 巽: [50, "鼎"], 离: [30, "离"], 兑: [38, "睽"] },
  兑: { 乾: [43, "夬"], 震: [17, "随"], 坎: [47, "困"], 艮: [31, "咸"], 坤: [45, "萃"], 巽: [28, "大过"], 离: [49, "革"], 兑: [58, "兑"] },
};
const HEXAGRAMS = [];
for (const up in HEX_TABLE) for (const low in HEX_TABLE[up]) {
  const [no, name] = HEX_TABLE[up][low];
  HEXAGRAMS.push({ no, name, upper: up, lower: low, lines: TRIGRAMS[low] + TRIGRAMS[up] });
}
HEXAGRAMS.sort((a, b) => a.no - b.no);

function hash(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}
// 每篇文章一卦：信息区写了「gua: 卦名」就用它，否则按文件名算出一卦
function guaOf(post) {
  const set = HEXAGRAMS.find((g) => g.name === post.gua);
  return set ? { ...set, how: "信息区指定" } : castGua(post);
}

// 梅花易数·年月日时起卦（以发布日期起卦）
//   上卦 = (年支数 + 月 + 日) ÷ 8 取余；下卦 = (年支数 + 月 + 日 + 时辰数) ÷ 8 取余；余 0 作 8
//   先天八卦数：乾1 兑2 离3 震4 巽5 坎6 艮7 坤8
//   年支数：子1 丑2 … 亥12；时辰数：子1（23–1 点）… 亥12（21–23 点）
//   date 里没写时间（如 2026-11-19）时，用标题字数代替时辰数（字数起卦）
//   注：传统用农历月日，这里简化为公历月日
const XIANTIAN = ["坤", "乾", "兑", "离", "震", "巽", "坎", "艮"];   // 下标 = 余数（0 即 8 → 坤）
function castGua(post) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):\d{2})?/.exec(post.date || "");
  if (!m) return { ...HEXAGRAMS[hash(post.slug) % 64], how: "按文件名" };   // 没有日期（如「关于」页）时才退回按文件名
  const year = +m[1], month = +m[2], day = +m[3];
  const branch = ((year - 4) % 12) + 1;                   // 子=1 … 亥=12
  const hourNum = m[4] !== undefined
    ? Math.floor(((+m[4] + 1) % 24) / 2) + 1               // 23–1 点为子时(1)，21–23 点为亥时(12)
    : [...(post.title || "")].filter((c) => /\S/.test(c)).length;
  const base = branch + month + day;
  const upper = XIANTIAN[base % 8], lower = XIANTIAN[(base + hourNum) % 8];
  const g = HEXAGRAMS.find((x) => x.upper === upper && x.lower === lower);
  const by = m[4] !== undefined ? "子丑寅卯辰巳午未申酉戌亥"[hourNum - 1] + "时" : `题${cnNumber(hourNum)}字`;
  return { ...g, how: `${ganzhi(year)}年${cnNumber(month)}月${cnNumber(day)}日 · ${by} 起卦` };
}
// 画卦：六爻自下而上，阴爻是中间断开的两段
function guaSvg(lines) {
  const rows = [...lines].map((bit, i) => {
    const y = 50 - i * 9;
    return bit === "1"
      ? `<rect x="0" y="${y}" width="48" height="5.5" rx="1"/>`
      : `<rect class="yin-l" x="0" y="${y}" width="20" height="5.5" rx="1"/><rect class="yin-r" x="28" y="${y}" width="20" height="5.5" rx="1"/>`;
  }).join("");
  return `<svg class="gua" viewBox="0 0 48 56" aria-hidden="true">${rows}</svg>`;
}

/* ========== 中文日期（干支纪年） ========== */
const CN_DIGIT = "〇一二三四五六七八九";
function cnNumber(n) {
  if (n < 10) return CN_DIGIT[n];
  if (n < 20) return "十" + (n % 10 ? CN_DIGIT[n % 10] : "");
  if (n < 100) return CN_DIGIT[Math.floor(n / 10)] + "十" + (n % 10 ? CN_DIGIT[n % 10] : "");
  return String(n);
}
const ganzhi = (y) => "甲乙丙丁戊己庚辛壬癸"[(y - 4) % 10] + "子丑寅卯辰巳午未申酉戌亥"[(y - 4) % 12];
function cnDate(iso, withYear = true) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  return `${withYear ? ganzhi(y) + "年 " : ""}${cnNumber(mo)}月${cnNumber(d)}日`;
}

/* ========== 首页八卦环（先天八卦，乾在上、坤在下） ========== */
function drawBaguaRing(g) {
  const order = ["乾", "巽", "坎", "艮", "坤", "震", "离", "兑"];   // 从正上方开始顺时针
  const parts = [`<circle class="rim" cx="200" cy="200" r="112"/>`, `<circle class="rim dash" cx="200" cy="200" r="186"/>`];
  order.forEach((name, k) => {
    const lines = TRIGRAMS[name];
    const bars = [...lines].map((bit, i) => {
      const y = 200 - 124 - i * 13;          // 第一爻离圆心最近
      return bit === "1"
        ? `<rect class="yao" x="174" y="${y - 8}" width="52" height="8" rx="1"/>`
        : `<rect class="yao" x="174" y="${y - 8}" width="22" height="8" rx="1"/><rect class="yao" x="204" y="${y - 8}" width="22" height="8" rx="1"/>`;
    }).join("");
    parts.push(`<g transform="rotate(${k * 45} 200 200)">${bars}<text x="200" y="${200 - 124 - 3 * 13 - 6}" text-anchor="middle">${name}</text></g>`);
  });
  g.innerHTML = parts.join("");
}

/* ========== 封面：水墨画 ========== */
// static/img/covers/ 里的水墨画（由 Codex 生成），按文章名分配；信息区写「cover: 图片路径」可换成自己的图
const COVERS = ["bamboo", "plum", "lotus", "crane", "peaks", "angler"];
function coverHtml(post) {
  const src = post.cover || `static/img/covers/${COVERS[(hash(post.slug) >>> 7) % COVERS.length]}.webp`;
  return `<img src="${escapeHtml(src)}" alt="" loading="lazy">`;
}

/* ========== 迷你 Markdown ========== */
function renderInline(src) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;
  let s = src.replace(/(`+)(.+?)\1(?!`)/g, (_, _t, c) => keep(`<code>${escapeHtml(c.trim())}</code>`));
  s = escapeHtml(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => keep(`<img src="${url}" alt="${alt}" loading="lazy">`))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
      const external = /^https?:/i.test(url.replace(/&amp;/g, "&"));
      return `<a href="${url}"${external ? ' target="_blank" rel="noopener"' : ""}>${text}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[i]);
}

function renderMarkdown(md, ctx = { sec: 0 }) {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const isBlank = (l) => !l || !l.trim();
  const LIST = /^\s*([-*]|\d+[.)])\s+/;
  const startsBlock = (l) => /^(#{1,4}\s|>|```|(-{3,}|\*{3,})\s*$)/.test(l) || LIST.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    const fence = line.match(/^```\s*([\w-]*)/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<div class="codeblock"><div class="codeblock-bar"><i></i><i></i><i></i><span class="lang">${escapeHtml(fence[1] || "")}</span><button class="copy-btn" type="button">复制</button></div><pre><code>${escapeHtml(buf.join("\n"))}</code></pre></div>`);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = Math.max(2, h[1].length);   // 文章大标题占用 h1，# 和 ## 都生成 h2
      const id = `sec-${++ctx.sec}`;
      out.push(`<h${level} id="${id}">${renderInline(h[2].trim())}<a class="anchor" href="#${id}" aria-hidden="true">#</a></h${level}>`);
      i++; continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
    if (/^>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${renderMarkdown(buf.join("\n"), ctx)}</blockquote>`);
      continue;
    }
    const lm = line.match(LIST);
    if (lm) {
      const ordered = /\d/.test(lm[1]);
      const items = [];
      while (i < lines.length && LIST.test(lines[i])) {
        let item = lines[i++].replace(LIST, "");
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !LIST.test(lines[i])) item += " " + lines[i++].trim();
        items.push(`<li>${renderInline(item)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }
    if (/^<[a-z!]/i.test(line.trim())) {          // 以 < 开头的段落按原样输出 HTML
      const buf = [];
      while (i < lines.length && !isBlank(lines[i])) buf.push(lines[i++]);
      out.push(buf.join("\n"));
      continue;
    }
    const buf = [];                                // 段落：段内换行保留
    while (i < lines.length && !isBlank(lines[i]) && !(buf.length && startsBlock(lines[i]))) buf.push(lines[i++]);
    out.push(`<p>${buf.map((l) => renderInline(l.trim())).join("<br>")}</p>`);
  }
  return out.join("\n");
}

/* ========== 读取文章 ========== */
let indexCache = null;
function loadIndex() {
  indexCache ||= (async () => {
    const list = await fetchText("content/list.txt");
    const slugs = list.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && SLUG_OK.test(l));
    const posts = await Promise.all(slugs.map(async (slug) => {
      try {
        const { meta, body } = splitFrontMatter(await fetchText(`content/${slug}.md`));
        return { slug, title: meta.title || slug, date: meta.date || "", summary: meta.summary || "", tags: meta.tags, cover: meta.cover || "", gua: meta.gua || "", minutes: readMinutes(body) };
      } catch (err) {
        console.warn("文章读取失败：", slug, err);
        return null;
      }
    }));
    return posts.filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
  })();
  return indexCache;
}

function offlineNotice(err) {
  console.error(err);
  return `<p class="notice">文章没能加载出来。如果你是直接双击打开的 HTML 文件，浏览器会拦截读取本地文件——请在站点文件夹里运行 <code>python -m http.server 8000</code>，再访问 <code>http://localhost:8000</code>。</p>`;
}
const tagsHtml = (tags) => tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
const postUrl = (p) => `article.html?p=${encodeURIComponent(p.slug)}`;
const ready = () => document.dispatchEvent(new CustomEvent("content:ready"));

/* ========== 首页 ========== */
function cardHtml(p, i, featured = false) {
  const g = guaOf(p);
  return `
    <a class="card${featured ? " featured" : ""}${!featured && i === 0 ? " is-latest" : ""}" href="${postUrl(p)}" data-tilt data-cursor="展卷" data-reveal style="--i:${i % 6}" data-tags="${escapeHtml(p.tags.join("|"))}">
      <div class="cover">${coverHtml(p)}${featured
        ? `<span class="cover-title" aria-hidden="true">${escapeHtml(p.title)}</span>`
        : `<span class="gua-badge" title="第${cnNumber(g.no)}卦 · ${g.name} · ${g.how}">${guaSvg(g.lines)}${g.name}</span>`}</div>
      <div class="card-body">
        ${featured ? `<span class="badge">新篇</span>` : ""}
        <h3 class="card-title"><span>${escapeHtml(p.title)}</span></h3>
        <div class="meta"><time datetime="${escapeHtml(p.date)}">${cnDate(p.date)}</time><i class="dot"></i><span>约${cnNumber(p.minutes)}分钟读完</span></div>
        ${p.summary ? `<p class="card-summary" style="margin-top:10px">${escapeHtml(p.summary)}</p>` : ""}
        ${featured ? `<div class="gua-line" title="${g.how}">${guaSvg(g.lines)}<span>第${cnNumber(g.no)}卦 · ${g.name} · ${g.upper}上${g.lower}下</span></div>` : ""}
        <div class="card-foot"><div class="tags">${tagsHtml(p.tags)}</div><span class="read-more" aria-hidden="true">阅</span></div>
      </div>
    </a>`;
}

async function renderHome() {
  const ring = document.getElementById("bagua-ring");
  if (ring) drawBaguaRing(ring);
  document.getElementById("stat-year").textContent = ganzhi(new Date().getFullYear());
  const featured = document.getElementById("featured");
  const grid = document.getElementById("grid");
  const filters = document.getElementById("filters");
  try {
    const posts = await loadIndex();
    const tags = [...new Set(posts.flatMap((p) => p.tags))];
    document.getElementById("stat-posts").textContent = cnNumber(posts.length);
    document.getElementById("stat-tags").textContent = cnNumber(tags.length);
    document.getElementById("stat-updated").textContent = posts[0] ? cnDate(posts[0].date, false) : "–";

    if (!posts.length) { featured.innerHTML = `<p class="notice">还没有文章。</p>`; return; }
    featured.innerHTML = cardHtml(posts[0], 0, true);
    grid.innerHTML = posts.map((p, i) => cardHtml(p, i)).join("") + `<p class="empty" hidden>此类尚无文章。</p>`;
    filters.innerHTML = ["全部", ...tags].map((t, i) =>
      `<button class="chip" type="button" data-tag="${i ? escapeHtml(t) : ""}" aria-pressed="${i === 0}">${escapeHtml(t)}</button>`).join("");

    filters.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      filters.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c === chip));
      const tag = chip.dataset.tag;
      grid.classList.toggle("filtering", Boolean(tag));   // 选了标签时，最新一篇也要出现在列表里
      let shown = 0;
      grid.querySelectorAll(".card").forEach((card, i) => {
        const hit = tag ? card.dataset.tags.split("|").includes(tag) : !card.classList.contains("is-latest");
        card.classList.toggle("is-hidden", !hit);
        if (hit) {               // 重新播放入场动画
          card.classList.remove("in");
          card.style.setProperty("--i", shown++);
          requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("in")));
        }
      });
      grid.querySelector(".empty").hidden = shown > 0 || !tag;
    });
  } catch (err) {
    featured.innerHTML = offlineNotice(err);
  }
  ready();
}

/* ========== 文章页 ========== */
async function renderArticle(root) {
  const slug = new URLSearchParams(location.search).get("p") || "";
  document.querySelector(`[data-nav="${CSS.escape(slug)}"]`)?.setAttribute("aria-current", "page");

  if (!SLUG_OK.test(slug)) {
    root.innerHTML = `<p class="notice" style="margin-top:34px">没有指定文章。<a href="./">回到篇目</a></p>`;
    return ready();
  }
  let text;
  try {
    text = await fetchText(`content/${slug}.md`);
  } catch (err) {
    root.innerHTML = /404/.test(err.message)
      ? `<p class="notice" style="margin-top:34px">找不到这篇文章（content/${escapeHtml(slug)}.md）。<a href="./">回到篇目</a></p>`
      : offlineNotice(err);
    return ready();
  }
  const { meta, body } = splitFrontMatter(text);
  const post = { slug, title: meta.title || slug, date: meta.date || "", summary: meta.summary || "", tags: meta.tags, cover: meta.cover || "", gua: meta.gua || "" };
  document.title = `${post.title} · ${SITE.name}`;

  const isPost = Boolean(post.date);
  const g = guaOf(post);
  const head = isPost
    ? `<header class="article-head" data-reveal>
         <div class="article-banner">${coverHtml(post)}</div>
         <div class="article-title-row">
           <div class="gua-card" title="${g.upper}上${g.lower}下 · ${g.how}">${guaSvg(g.lines)}<strong>${g.name}</strong><small>第${cnNumber(g.no)}卦</small></div>
           <div>
             <h1>${escapeHtml(post.title)}</h1>
             ${post.summary ? `<p class="lead">${escapeHtml(post.summary)}</p>` : ""}
             <div class="meta"><time datetime="${escapeHtml(post.date)}">${cnDate(post.date)}</time><i class="dot"></i><span>约${cnNumber(readMinutes(body))}分钟读完</span>${post.tags.length ? `<span class="tags">${tagsHtml(post.tags)}</span>` : ""}</div>
           </div>
         </div>
       </header>`
    : `<header class="plain-head" data-reveal><h1>${escapeHtml(post.title)}</h1></header>`;

  root.innerHTML = `${head}
    <div class="article-layout">
      <div>
        <div class="prose" data-reveal style="--i:1">${renderMarkdown(body)}</div>
        ${isPost ? `<div class="the-end"><b>${escapeHtml(SITE.mark)}</b></div>` : ""}
        <nav class="sibling-nav" id="siblings" aria-label="相邻文章"></nav>
      </div>
      <aside class="toc" aria-label="目录"></aside>
    </div>`;

  // 目录
  const heads = [...root.querySelectorAll(".prose h2, .prose h3")];
  const toc = root.querySelector(".toc");
  if (heads.length >= 2) {
    toc.innerHTML = `<div class="toc-title">目录</div><ol>${heads.map((h) =>
      `<li class="lv${h.tagName[1]}"><a href="#${h.id}">${escapeHtml(h.textContent.replace(/#$/, ""))}</a></li>`).join("")}</ol>`;
  } else {
    toc.remove();
    root.querySelector(".article-layout").classList.add("no-toc");
  }

  // 代码复制
  root.querySelectorAll(".copy-btn").forEach((btn) => btn.addEventListener("click", async () => {
    const code = btn.closest(".codeblock").querySelector("code").textContent;
    try { await navigator.clipboard.writeText(code); btn.textContent = "已复制 ✓"; }
    catch (_) { btn.textContent = "复制失败"; }
    btn.classList.add("done");
    setTimeout(() => { btn.textContent = "复制"; btn.classList.remove("done"); }, 1600);
  }));

  // 点击图片放大
  root.querySelectorAll(".prose img").forEach((img) => img.addEventListener("click", () => {
    const box = document.createElement("div");
    box.className = "lightbox";
    box.innerHTML = `<img src="${img.src}" alt="${escapeHtml(img.alt)}">`;
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add("open"));
    const close = () => { box.classList.remove("open"); setTimeout(() => box.remove(), 300); removeEventListener("keydown", onKey); };
    const onKey = (e) => e.key === "Escape" && close();
    box.addEventListener("click", close);
    addEventListener("keydown", onKey);
  }));

  ready();

  // 上一篇 / 下一篇
  try {
    const posts = await loadIndex();
    const i = posts.findIndex((p) => p.slug === slug);
    const nav = document.getElementById("siblings");
    if (i === -1) return nav.remove();
    const newer = posts[i - 1], older = posts[i + 1];
    nav.innerHTML =
      (older ? `<a class="card prev" href="${postUrl(older)}" data-tilt data-cursor="前篇"><small>← 前篇</small><strong>${escapeHtml(older.title)}</strong></a>` : "") +
      (newer ? `<a class="card next" href="${postUrl(newer)}" data-tilt data-cursor="后篇"><small>后篇 →</small><strong>${escapeHtml(newer.title)}</strong></a>` : "");
  } catch (_) { /* 列表读不到就不显示 */ }
}

/* ========== 顶栏时辰钟：时辰 · 刻 · 节气 ========== */
const ZHI = "子丑寅卯辰巳午未申酉戌亥";
// 二十四节气（21 世纪通用公式：日 = [Y×0.2422 + C] − [闰年数]，Y 为年份后两位；个别年份会差一天，如 2026 年雨水算出 2/19，实为 2/18）
const JIEQI = [
  ["小寒", 1, 5.4055], ["大寒", 1, 20.12], ["立春", 2, 3.87], ["雨水", 2, 18.73],
  ["惊蛰", 3, 5.63], ["春分", 3, 20.646], ["清明", 4, 4.81], ["谷雨", 4, 20.1],
  ["立夏", 5, 5.52], ["小满", 5, 21.04], ["芒种", 6, 5.678], ["夏至", 6, 21.37],
  ["小暑", 7, 7.108], ["大暑", 7, 22.83], ["立秋", 8, 7.5], ["处暑", 8, 23.13],
  ["白露", 9, 7.646], ["秋分", 9, 23.042], ["寒露", 10, 8.318], ["霜降", 10, 23.438],
  ["立冬", 11, 7.438], ["小雪", 11, 22.36], ["大雪", 12, 7.18], ["冬至", 12, 21.94],
];
function jieqiDates(year) {
  const y = year % 100;
  return JIEQI.map(([name, month, c]) => {
    const leap = month <= 2 ? Math.floor((y - 1) / 4) : Math.floor(y / 4);   // 一、二月的节气用上一年算闰年数
    return { name, date: new Date(year, month - 1, Math.floor(y * 0.2422 + c) - leap) };
  });
}
function currentJieqi(now) {
  const list = [...jieqiDates(now.getFullYear() - 1), ...jieqiDates(now.getFullYear()), ...jieqiDates(now.getFullYear() + 1)];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let i = list.findIndex((t) => t.date > today) - 1;
  const cur = list[i], next = list[i + 1];
  return { name: cur.name, next: next.name, daysToNext: Math.round((next.date - today) / 86400000) };
}
// 时辰：23–1 点为子时……；刻：一个时辰八刻，每刻十五分钟（「午时三刻」= 11:45）
function shichen(now) {
  const h = now.getHours(), m = now.getMinutes();
  const idx = Math.floor(((h + 1) % 24) / 2);
  const into = ((h + 1) % 2) * 60 + m;                 // 进入这个时辰多少分钟
  const ke = Math.floor(into / 15);
  return { idx, name: ZHI[idx] + "时", ke: ke === 0 ? "初" : cnNumber(ke) + "刻" };
}
function startShichenClock(el) {
  const text = el.querySelector(".sc-text");
  const hand = el.querySelector(".sc-hand");
  const tick = () => {
    const now = new Date();
    const s = shichen(now), j = currentJieqi(now);
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    text.innerHTML = `<b>${s.name}${s.ke}</b><span class="sc-jq"> · ${j.name}</span>`;
    el.title = `${cnDate(iso)} ${hm} · ${s.name}${s.ke} · ${j.name}（距${j.next}还有${cnNumber(j.daysToNext)}日）`;
    el.setAttribute("aria-label", el.title);
    // 日晷指针：子时朝下（正北在下），按分钟平滑转动
    const minutes = ((now.getHours() + 1) % 24) * 60 + now.getMinutes();
    hand.setAttribute("transform", `rotate(${180 + (minutes / 1440) * 360})`);
  };
  tick();
  setInterval(tick, 30000);
}

/* ========== 启动 ========== */
document.querySelectorAll("[data-site]").forEach((el) => {
  const key = el.dataset.site;
  if (key === "year") el.textContent = new Date().getFullYear();
  else if (SITE[key]) el.textContent = SITE[key];
});
if (document.title === "旁注") document.title = SITE.name;

const clockEl = document.getElementById("shichen");
if (clockEl) startShichenClock(clockEl);
if (document.getElementById("featured")) renderHome();
const articleRoot = document.getElementById("article");
if (articleRoot) renderArticle(articleRoot);
