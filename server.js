#!/usr/bin/env node
// wikiport — a clean local viewer for OpenWiki docs: one repo or a whole
// workspace of them. Zero npm dependencies; markdown/mermaid render client-side.
// Defaults to loopback; pass --host 0.0.0.0 to reach it over LAN/VPN (e.g.
// Tailscale). Never expose it to the public internet.
const http = require("http");
const fs = require("fs");
const path = require("path");

// CLI: wikiport [root] [--port N] [--host H]
//   root: a directory of repos (each with an openwiki/ folder), or a single
//         repo, or an openwiki/ folder itself — auto-detected.
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    "usage: wikiport [root] [--port N] [--host H]\n" +
      "  root defaults to the current directory. Auto-detects whether it is a\n" +
      "  workspace of repos, a single repo, or an openwiki/ folder.\n" +
      "  --host 0.0.0.0 exposes on your LAN/VPN (default 127.0.0.1).",
  );
  process.exit(0);
}
const ROOT = path.resolve(
  args.find((a) => !a.startsWith("-")) || process.env.WIKIPORT_ROOT || ".",
);
const PORT = Number(flag("--port", process.env.WIKIPORT_PORT || 7747));
const HOST = flag("--host", process.env.WIKIPORT_HOST || "127.0.0.1");

function hasPages(dir) {
  try {
    return walk(dir).length > 0;
  } catch {
    return false;
  }
}

// Mode detection. Workspace mode wins whenever any child repo carries a wiki —
// otherwise a workspace containing a repo literally named "openwiki" would be
// misread as a single project. Single mode: ROOT is a repo with an openwiki/
// folder, or an openwiki/ folder itself.
function isWorkspace(root) {
  try {
    return fs
      .readdirSync(root)
      .some((c) => {
        try {
          return fs.statSync(path.join(root, c, "openwiki")).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return false;
  }
}
const SINGLE = isWorkspace(ROOT)
  ? null
  : hasPages(path.join(ROOT, "openwiki"))
    ? path.join(ROOT, "openwiki")
    : path.basename(ROOT) === "openwiki" && hasPages(ROOT)
      ? ROOT
      : null;

function wikiDir(project) {
  if (SINGLE) return SINGLE;
  if (!/^[\w.-]+$/.test(project)) return null;
  return path.join(ROOT, project, "openwiki");
}

function listProjects() {
  if (SINGLE) {
    const pages = walk(SINGLE);
    return [
      {
        name: path.basename(path.dirname(SINGLE)) || "wiki",
        pages: pages.length,
        updated: Math.max(...pages.map((p) => p.mtime)),
      },
    ];
  }
  const out = [];
  for (const name of fs.readdirSync(ROOT)) {
    const wiki = path.join(ROOT, name, "openwiki");
    let stat;
    try {
      stat = fs.statSync(wiki);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const pages = walk(wiki);
    if (pages.length === 0) continue;
    const updated = Math.max(...pages.map((p) => p.mtime));
    const desc =
      fm(path.join(wiki, "quickstart.md"), "description") ||
      fm(path.join(wiki, "index.md"), "description");
    out.push({ name, pages: pages.length, updated, desc });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Cheap frontmatter reads for humanizing the UI: page titles in the nav,
// wiki descriptions on the home cards.
function fm(file, key) {
  try {
    const head = fs.readFileSync(file, "utf8").slice(0, 600);
    const m = head.match(new RegExp("^---\\n[\\s\\S]*?\\b" + key + ":\\s*(.+)$", "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}

function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "_skeleton.md") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.name.endsWith(".md"))
      out.push({
        rel: path.relative(base, full),
        mtime: fs.statSync(full).mtimeMs,
      });
  }
  return out;
}

// Resolve a project/page pair to a real file, refusing anything that
// escapes that project's openwiki directory.
function safePage(project, rel) {
  const wiki = wikiDir(project);
  if (!wiki) return null;
  const full = path.resolve(wiki, rel);
  if (!full.startsWith(wiki + path.sep)) return null;
  if (!full.endsWith(".md")) return null;
  try {
    return fs.readFileSync(full, "utf8");
  } catch {
    return null;
  }
}

// Multi-term AND search, ranked: title > heading > body. Optionally scoped
// to one project (in-project search boxes pass their project name).
function search(q, project) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits = [];
  const projects = listProjects().filter(
    (p) => !project || p.name === project,
  );
  for (const proj of projects) {
    const wiki = wikiDir(proj.name);
    for (const page of walk(wiki)) {
      const text = fs.readFileSync(path.join(wiki, page.rel), "utf8");
      const lower = text.toLowerCase();
      if (!terms.every((t) => lower.includes(t))) continue;
      const title =
        (text.match(/^---\n[\s\S]*?\btitle:\s*(.+)$/m) || [])[1]?.trim() ||
        page.rel.split("/").pop().replace(/\.md$/, "");
      let score = 1;
      const titleLower = title.toLowerCase();
      if (terms.some((t) => titleLower.includes(t))) score += 4;
      if (terms.some((t) => page.rel.toLowerCase().includes(t))) score += 3;
      for (const line of text.split("\n")) {
        if (line.startsWith("#") && terms.some((t) => line.toLowerCase().includes(t))) {
          score += 2;
          break;
        }
      }
      const idx = lower.indexOf(terms[0]);
      const start = Math.max(0, idx - 60);
      hits.push({
        project: proj.name,
        page: page.rel,
        title,
        score,
        snippet: text
          .slice(start, idx + terms[0].length + 110)
          .replace(/\s+/g, " ")
          .trim(),
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 50);
}

function json(res, data) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(PAGE);
  }
  if (url.pathname === "/api/projects") return json(res, listProjects());
  if (url.pathname === "/api/tree") {
    const wiki = wikiDir(url.searchParams.get("project") || "");
    if (!wiki) return json(res, []);
    try {
      return json(
        res,
        walk(wiki)
          .map((x) => ({
            rel: x.rel,
            title:
              fm(path.join(wiki, x.rel), "title") ||
              (x.rel.endsWith("index.md")
                ? (x.rel.includes("/")
                    ? x.rel.split("/").slice(-2)[0] + " overview"
                    : "Overview")
                : x.rel.split("/").pop().replace(/\.md$/, "")),
          }))
          .sort((a, b) => a.rel.localeCompare(b.rel)),
      );
    } catch {
      return json(res, []);
    }
  }
  if (url.pathname === "/api/page") {
    const body = safePage(
      url.searchParams.get("project") || "",
      url.searchParams.get("path") || "",
    );
    if (body === null) {
      res.writeHead(404);
      return res.end("not found");
    }
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    return res.end(body);
  }
  if (url.pathname === "/api/search") {
    const q = (url.searchParams.get("q") || "").trim();
    const scope = url.searchParams.get("project") || "";
    return json(res, q.length >= 2 ? search(q, scope) : []);
  }
  res.writeHead(404);
  res.end("not found");
});

const PAGE = /* html */ `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>wikiport</title>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<style>
  /* Rubrication: navigation and interaction in red ink, content in black.
     Type: ui-serif display, system sans body, mono for catalog metadata. */
  :root {
    --bg: #f6f6f4; --fg: #1c1d1f; --mutedfg: #6e7074;
    --line: #e3e3df; --card: #ffffff; --rubric: #a63d2f; --code: #ededea;
    --mark: #a63d2f22;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #161719; --fg: #dcdcd8; --mutedfg: #8f9093; --line: #2a2b2e;
      --card: #1d1e21; --rubric: #d97b64; --code: #232427; --mark: #d97b6426;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 15px/1.65 -apple-system, system-ui, "Segoe UI", sans-serif;
  }
  ::selection { background: var(--mark); }
  a:focus-visible, input:focus-visible, .card:focus-visible {
    outline: 2px solid var(--rubric); outline-offset: 2px;
  }
  header {
    display: flex; align-items: baseline; gap: 12px; padding: 12px 18px;
    border-bottom: 1px solid var(--line); position: sticky; top: 0;
    background: var(--bg); z-index: 2;
  }
  header a {
    color: var(--fg); text-decoration: none; font-weight: 600;
    font-family: ui-serif, Georgia, serif; font-size: 17px; letter-spacing: .01em;
  }
  header a::first-letter { color: var(--rubric); }
  header input {
    flex: 1; max-width: 360px; margin-left: auto; padding: 5px 10px;
    border: 1px solid var(--line); border-radius: 6px;
    background: var(--card); color: var(--fg); font: 13.5px/1.5 ui-monospace, Menlo, monospace;
  }
  header input::placeholder { color: var(--mutedfg); }
  header input:focus { outline: none; border-color: var(--rubric); }
  #home {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 10px; padding: 20px 18px; max-width: 1080px; margin: 0 auto;
  }
  .card {
    border: 1px solid var(--line); border-radius: 6px; background: var(--card);
    padding: 13px 15px 11px; cursor: pointer; display: flex;
    flex-direction: column; gap: 2px;
  }
  .card:hover { border-color: var(--rubric); }
  .card:hover b { color: var(--rubric); }
  .card b {
    font-family: ui-serif, Georgia, serif; font-weight: 600; font-size: 16px;
  }
  .card em {
    font-style: normal; color: var(--mutedfg); font-size: 12.5px; line-height: 1.5;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; margin: 1px 0 4px;
  }
  .card span {
    color: var(--mutedfg); font: 11px/1.6 ui-monospace, Menlo, monospace;
    margin-top: auto;
  }
  #wrap { display: flex; min-height: calc(100vh - 50px); }
  nav {
    width: 248px; flex-shrink: 0; border-right: 1px solid var(--line);
    padding: 14px 0 24px; overflow-y: auto; position: sticky; top: 50px;
    height: calc(100vh - 50px);
  }
  nav a {
    display: block; padding: 3px 18px; color: var(--fg); text-decoration: none;
    font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    border-left: 2px solid transparent;
  }
  nav a.dir {
    color: var(--mutedfg); font: 10.5px/2 ui-monospace, Menlo, monospace;
    text-transform: uppercase; letter-spacing: .09em; margin-top: 12px;
    pointer-events: none; border-left: none;
  }
  nav a.dir.link { pointer-events: auto; }
  nav a.dir.link:hover, nav a.dir.link.active { color: var(--rubric); }
  .lede {
    font-family: ui-serif, Georgia, serif; font-style: italic;
    color: var(--mutedfg); font-size: 15.5px; margin: 0 0 18px;
    padding-bottom: 14px; border-bottom: 1px solid var(--line);
  }
  nav a.active { color: var(--rubric); border-left-color: var(--rubric); }
  nav a:hover { color: var(--rubric); }
  main { flex: 1; min-width: 0; padding: 28px 36px 90px; max-width: 730px; }
  main h1, main h2, main h3, main h4 {
    font-family: ui-serif, Georgia, serif; line-height: 1.25; font-weight: 600;
  }
  main h1 { font-size: 27px; margin: 0 0 .6em; }
  main h2 {
    font-size: 19px; margin-top: 2.1em; padding-bottom: .25em;
    border-bottom: 1px solid var(--line);
  }
  main h3 { font-size: 16px; margin-top: 1.7em; }
  main a { color: var(--rubric); text-decoration-color: var(--mark); }
  main a:hover { text-decoration-color: var(--rubric); }
  main code {
    background: var(--code); padding: 1px 5px; border-radius: 4px;
    font: 12.5px/1.5 ui-monospace, Menlo, monospace;
  }
  main pre {
    background: var(--code); padding: 12px 14px; border-radius: 6px;
    overflow-x: auto; border: 1px solid var(--line);
  }
  main pre code { background: none; padding: 0; border: none; }
  main table {
    border-collapse: collapse; display: block; overflow-x: auto; font-size: 14px;
  }
  main th { font-weight: 600; }
  main th, main td { border: 1px solid var(--line); padding: 5px 10px; text-align: left; }
  main blockquote {
    border-left: 2px solid var(--rubric); margin-left: 0; padding-left: 14px;
    color: var(--mutedfg);
  }
  main hr { border: none; border-top: 1px solid var(--line); }
  main img { max-width: 100%; }
  .broken { color: var(--mutedfg); border-bottom: 1px dashed var(--mutedfg); cursor: help; }
  .crumb {
    color: var(--mutedfg); font: 11.5px/1.6 ui-monospace, Menlo, monospace;
    margin-bottom: 10px;
  }
  #results { max-width: 730px; margin: 0 auto; padding: 18px; }
  .rhead {
    color: var(--mutedfg); font: 11.5px/1.6 ui-monospace, Menlo, monospace;
    margin: 4px 2px 12px;
  }
  .hit {
    border: 1px solid var(--line); border-radius: 6px; background: var(--card);
    padding: 11px 14px; margin-bottom: 8px; cursor: pointer;
  }
  .hit:hover { border-color: var(--rubric); }
  .hit:hover b { color: var(--rubric); }
  .hit b { font-family: ui-serif, Georgia, serif; font-size: 15px; font-weight: 600; }
  .hit .hloc {
    color: var(--mutedfg); font: 11px/1.6 ui-monospace, Menlo, monospace; margin-left: 8px;
  }
  .hit div { color: var(--mutedfg); font-size: 13px; margin-top: 3px; }
  mark { background: var(--mark); color: inherit; border-radius: 2px; padding: 0 1px; }
  #toc {
    width: 200px; flex-shrink: 0; position: sticky; top: 50px;
    height: calc(100vh - 50px); overflow-y: auto; padding: 26px 18px 24px 0;
  }
  .toctitle {
    color: var(--mutedfg); font: 10.5px/2 ui-monospace, Menlo, monospace;
    text-transform: uppercase; letter-spacing: .09em; margin-bottom: 4px;
  }
  #toc a {
    display: block; color: var(--mutedfg); text-decoration: none;
    font-size: 12.5px; line-height: 1.5; padding: 2px 0;
  }
  #toc a:hover { color: var(--rubric); }
  #pager {
    display: flex; justify-content: space-between; gap: 12px;
    margin-top: 48px; padding-top: 18px; border-top: 1px solid var(--line);
  }
  #pager a {
    max-width: 46%; text-decoration: none; color: var(--fg);
    font-family: ui-serif, Georgia, serif; font-size: 15px;
  }
  #pager a span {
    display: block; color: var(--mutedfg);
    font: 10.5px/2 ui-monospace, Menlo, monospace; text-transform: uppercase;
    letter-spacing: .09em;
  }
  #pager a:hover { color: var(--rubric); }
  #pager .next { margin-left: auto; text-align: right; }
  @media (max-width: 1120px) { #toc { display: none; } }
  @media (max-width: 700px) {
    #wrap { flex-direction: column; }
    nav { width: 100%; height: auto; position: static; display: flex;
      flex-wrap: wrap; gap: 0 4px; border-right: none;
      border-bottom: 1px solid var(--line); padding: 8px 0 12px; }
    nav a { border-left: none; }
    nav a.active { border-left: none; text-decoration: underline;
      text-decoration-color: var(--rubric); }
    nav a.dir { margin-top: 6px; width: 100%; }
    main { padding: 18px 16px 60px; }
  }
</style>
<header>
  <a href="#/">wikiport</a>
  <input id="q" placeholder="search all wikis…" autocomplete="off">
</header>
<div id="view"></div>
<script>
const view = document.getElementById("view");
const q = document.getElementById("q");
function currentProject() {
  const p = location.hash.replace(/^#\\//, "").split("/")[0];
  return p || null;
}
function syncSearchScope() {
  const p = currentProject();
  q.placeholder = p ? \`search \${p}…\` : "search all wikis…";
}
let trees = {}; // project -> [paths]
mermaid.initialize({ startOnLoad: false, theme:
  matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "neutral" });

async function api(p) { return (await fetch(p)).json(); }

function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  return Math.round(s / 86400) + "d ago";
}
async function home() {
  const projects = await api("/api/projects");
  view.innerHTML = '<div id="home">' + projects.map(p =>
    \`<div class="card" tabindex="0" onclick="location.hash='#/\${p.name}'"><b>\${p.name}</b>
     \${p.desc ? '<em>' + esc(p.desc) + '</em>' : ''}
     <span>\${p.pages} pages · \${ago(p.updated)}</span></div>\`
  ).join("") + "</div>";
}

async function tree(project) {
  if (!trees[project]) trees[project] = await api("/api/tree?project=" + project);
  return trees[project];
}

function slug(s) { return s.toLowerCase().replace(/\\.md$/, "").replace(/[^a-z0-9]+/g, "-"); }

// [[wikilink]] / [[wikilink|label]] -> markdown link to the best-matching page.
function resolveWikilinks(md, pages) {
  const bySlug = {};
  for (const p of pages) {
    bySlug[slug(p.split("/").pop())] = p;
    bySlug[slug(p)] = p;
  }
  return md.replace(/\\[\\[([^\\]|]+)(?:\\|([^\\]]+))?\\]\\]/g, (m, target, label) => {
    const hit = bySlug[slug(target.trim())];
    const text = (label || target).trim();
    return hit ? \`[\${text}](\${hit})\` : \`<span class="broken" title="no page named \${target.trim()}">\${text}</span>\`;
  });
}

function stripFrontmatter(md) {
  const m = md.match(/^---\\n([\\s\\S]*?)\\n---\\n/);
  return m ? md.slice(m[0].length) : md;
}

async function page(project, rel) {
  const entries = await tree(project);
  const pages = entries.map(e => e.rel);
  const titleOf = {};
  for (const e of entries) titleOf[e.rel] = e.title;
  if (!rel) rel = pages.find(p => p === "quickstart.md") || pages.find(p => p === "index.md") || pages[0];
  const raw = await (await fetch(\`/api/page?project=\${project}&path=\${encodeURIComponent(rel)}\`)).text();
  const fmDesc = (raw.match(/^---\\n[\\s\\S]*?\\bdescription:\\s*(.+)$/m) || [])[1];
  const md = resolveWikilinks(stripFrontmatter(raw), pages);

  // Sidebar: section headers are the directory's own index page (when it has
  // one); index pages aren't listed twice. Everything shows its real title.
  const groups = {};
  for (const p of pages) {
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    (groups[dir] = groups[dir] || []).push(p);
  }
  // Reading order: quickstart, then root pages, then each section with its
  // index first. The same order drives the sidebar and prev/next pagination.
  for (const dir of Object.keys(groups)) {
    groups[dir].sort((a, b) => {
      const rank = (p) => (p.endsWith("quickstart.md") ? 0 : p.endsWith("index.md") ? 1 : 2);
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  }
  const orderedDirs = Object.keys(groups).sort((a, b) =>
    (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  const reading = orderedDirs.flatMap(d => groups[d]);
  const nav = orderedDirs.map(dir => {
    const dirIndex = dir ? dir + "/index.md" : null;
    const items = groups[dir].filter(p => p !== dirIndex);
    const header = dir
      ? (groups[dir].includes(dirIndex)
          ? \`<a class="dir link \${dirIndex === rel ? "active" : ""}" href="#/\${project}/\${dirIndex}">\${dir}</a>\`
          : \`<a class="dir">\${dir}</a>\`)
      : "";
    return header + items.map(p =>
      \`<a href="#/\${project}/\${p}" class="\${p === rel ? "active" : ""}">\${esc(titleOf[p] || p)}</a>\`
    ).join("");
  }).join("");

  view.innerHTML = \`<div id="wrap"><nav>\${nav}</nav>
    <main><div class="crumb">\${project} / \${rel}</div>\${fmDesc ? '<p class="lede">' + esc(fmDesc.trim()) + '</p>' : ''}<article></article><footer id="pager"></footer></main>
    <aside id="toc"></aside></div>\`;
  const article = view.querySelector("article");
  article.innerHTML = marked.parse(md);

  // relative .md links -> in-app routes (resolved against the current page's dir)
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "";
  for (const a of article.querySelectorAll("a")) {
    const href = a.getAttribute("href") || "";
    if (/^https?:/.test(href)) { a.target = "_blank"; continue; }
    const clean = href.split("#")[0];
    if (!clean.endsWith(".md")) continue;
    const target = new URL(clean, "http://x/" + dir).pathname.slice(1);
    a.setAttribute("href", "#/" + project + "/" + target);
  }

  // mermaid blocks
  let i = 0;
  for (const block of article.querySelectorAll("pre code.language-mermaid")) {
    const pre = block.parentElement;
    const div = document.createElement("pre");
    div.className = "mermaid";
    div.id = "mm" + i++;
    div.textContent = block.textContent;
    pre.replaceWith(div);
  }
  if (i) mermaid.run({ querySelector: ".mermaid" }).catch(() => {});

  // On this page: h2 outline in a right rail, so long pages have visible shape.
  const heads = [...article.querySelectorAll("h2")];
  const toc = view.querySelector("#toc");
  if (heads.length >= 2) {
    heads.forEach((h, n) => { h.id = "s" + n; });
    toc.innerHTML = '<div class="toctitle">On this page</div>' + heads.map((h, n) =>
      \`<a href="#\${""}" onclick="document.getElementById('s\${n}').scrollIntoView({behavior:'smooth'});return false">\${esc(h.textContent)}</a>\`
    ).join("");
  } else toc.innerHTML = "";

  // Prev / next along the reading order — documentation with a spine.
  const at = reading.indexOf(rel);
  const pager = view.querySelector("#pager");
  const link = (p, cls, label) =>
    \`<a class="\${cls}" href="#/\${project}/\${p}"><span>\${label}</span>\${esc(titleOf[p] || p)}</a>\`;
  pager.innerHTML =
    (at > 0 ? link(reading[at - 1], "prev", "previous") : "<span></span>") +
    (at < reading.length - 1 ? link(reading[at + 1], "next", "next") : "<span></span>");
  window.scrollTo(0, 0);
}

function esc(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function highlight(text, terms) {
  let out = esc(text);
  for (const t of terms) {
    out = out.replace(new RegExp("(" + t.replace(/[.*+?^\${}()|\\[\\]\\\\]/g, "\\\\$&") + ")", "gi"), "<mark>$1</mark>");
  }
  return out;
}
async function results(term) {
  const scope = currentProject();
  const hits = await api(
    "/api/search?q=" + encodeURIComponent(term) +
    (scope ? "&project=" + encodeURIComponent(scope) : "")
  );
  const terms = term.toLowerCase().split(/\\s+/).filter(Boolean);
  const where = scope ? "in " + scope : "across all wikis";
  view.innerHTML = '<div id="results"><p class="rhead">' +
    (hits.length ? hits.length + " results " + where : "no matches " + where) + "</p>" +
    hits.map(h =>
      \`<div class="hit" onclick="location.hash='#/\${h.project}/\${h.page}'">
        <b>\${esc(h.title)}</b><span class="hloc">\${scope ? "" : h.project + " · "}\${h.page}</span>
        <div>…\${highlight(h.snippet, terms)}…</div></div>\`
    ).join("") + "</div>";
}

let searchTimer;
q.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (q.value.trim().length >= 2) results(q.value.trim());
    else route();
  }, 250);
});

function route() {
  const parts = location.hash.replace(/^#\\//, "").split("/");
  const project = parts[0];
  if (!project) return home();
  page(project, parts.slice(1).join("/") || null);
}
addEventListener("hashchange", () => { q.value = ""; syncSearchScope(); route(); });
syncSearchScope();
route();
</script>`;

server.listen(PORT, HOST, () => {
  console.log(
    `wikiport: http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}` +
      `  (${SINGLE ? "wiki: " + SINGLE : "workspace: " + ROOT})`,
  );
});
