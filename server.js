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
    out.push({ name, pages: pages.length, updated });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
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

function search(q) {
  const needle = q.toLowerCase();
  const hits = [];
  for (const proj of listProjects()) {
    const wiki = wikiDir(proj.name);
    for (const page of walk(wiki)) {
      const text = fs.readFileSync(path.join(wiki, page.rel), "utf8");
      const idx = text.toLowerCase().indexOf(needle);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 60);
      hits.push({
        project: proj.name,
        page: page.rel,
        snippet: text.slice(start, idx + needle.length + 90).replace(/\s+/g, " "),
      });
      if (hits.length >= 60) return hits;
    }
  }
  return hits;
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
      return json(res, walk(wiki).map((x) => x.rel).sort());
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
    return json(res, q.length >= 2 ? search(q) : []);
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
  :root {
    --bg: #fafafa; --fg: #1a1a1a; --muted: #6b6b6b; --line: #e2e2e2;
    --card: #ffffff; --accent: #2563eb; --code: #f2f2f2;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #131313; --fg: #e6e6e6; --muted: #969696; --line: #2a2a2a;
      --card: #1b1b1b; --accent: #7aa2f7; --code: #202020;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 15px/1.6 -apple-system, system-ui, sans-serif;
  }
  header {
    display: flex; align-items: center; gap: 12px; padding: 10px 16px;
    border-bottom: 1px solid var(--line); position: sticky; top: 0;
    background: var(--bg); z-index: 2;
  }
  header a { color: var(--fg); text-decoration: none; font-weight: 600; }
  header input {
    flex: 1; max-width: 380px; margin-left: auto; padding: 6px 10px;
    border: 1px solid var(--line); border-radius: 6px;
    background: var(--card); color: var(--fg); font: inherit;
  }
  header input:focus { outline: none; border-color: var(--accent); }
  #home {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px; padding: 16px; max-width: 1100px; margin: 0 auto;
  }
  .card {
    border: 1px solid var(--line); border-radius: 8px; background: var(--card);
    padding: 12px 14px; cursor: pointer;
  }
  .card:hover { border-color: var(--accent); }
  .card b { display: block; }
  .card span { color: var(--muted); font-size: 13px; }
  #wrap { display: flex; min-height: calc(100vh - 49px); }
  nav {
    width: 250px; flex-shrink: 0; border-right: 1px solid var(--line);
    padding: 12px 0; overflow-y: auto; position: sticky; top: 49px;
    height: calc(100vh - 49px);
  }
  nav a {
    display: block; padding: 3px 16px; color: var(--fg); text-decoration: none;
    font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  nav a.dir { color: var(--muted); font-size: 11.5px; text-transform: uppercase;
    letter-spacing: .05em; margin-top: 10px; pointer-events: none; }
  nav a.active { color: var(--accent); border-left: 2px solid var(--accent); padding-left: 14px; }
  nav a:hover { color: var(--accent); }
  main { flex: 1; min-width: 0; padding: 24px 32px 80px; max-width: 780px; }
  main h1, main h2, main h3 { line-height: 1.3; }
  main h1 { font-size: 26px; } main h2 { font-size: 20px; margin-top: 2em; }
  main a { color: var(--accent); }
  main code { background: var(--code); padding: 1px 5px; border-radius: 4px; font-size: 13px; }
  main pre { background: var(--code); padding: 12px 14px; border-radius: 8px; overflow-x: auto; }
  main pre code { background: none; padding: 0; }
  main table { border-collapse: collapse; display: block; overflow-x: auto; }
  main th, main td { border: 1px solid var(--line); padding: 5px 10px; text-align: left; }
  main blockquote { border-left: 3px solid var(--line); margin-left: 0; padding-left: 14px; color: var(--muted); }
  .broken { color: var(--muted); border-bottom: 1px dashed var(--muted); cursor: help; }
  #results { max-width: 780px; margin: 0 auto; padding: 16px; }
  .hit { border: 1px solid var(--line); border-radius: 8px; background: var(--card);
    padding: 10px 14px; margin-bottom: 8px; cursor: pointer; }
  .hit:hover { border-color: var(--accent); }
  .hit b { font-size: 13.5px; }
  .hit div { color: var(--muted); font-size: 13px; }
  .crumb { color: var(--muted); font-size: 13px; margin-bottom: 4px; }
  @media (max-width: 700px) {
    #wrap { flex-direction: column; }
    nav { width: 100%; height: auto; position: static; display: flex;
      flex-wrap: wrap; gap: 0 6px; border-right: none; border-bottom: 1px solid var(--line); }
    nav a.dir { margin-top: 0; width: 100%; }
    main { padding: 16px; }
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
let trees = {}; // project -> [paths]
mermaid.initialize({ startOnLoad: false, theme:
  matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "neutral" });

async function api(p) { return (await fetch(p)).json(); }

async function home() {
  const projects = await api("/api/projects");
  view.innerHTML = '<div id="home">' + projects.map(p =>
    \`<div class="card" onclick="location.hash='#/\${p.name}'"><b>\${p.name}</b>
     <span>\${p.pages} pages · \${new Date(p.updated).toLocaleDateString()}</span></div>\`
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
  const pages = await tree(project);
  if (!rel) rel = pages.find(p => p === "quickstart.md") || pages.find(p => p === "index.md") || pages[0];
  const raw = await (await fetch(\`/api/page?project=\${project}&path=\${encodeURIComponent(rel)}\`)).text();
  const md = resolveWikilinks(stripFrontmatter(raw), pages);

  // sidebar grouped by directory
  const groups = {};
  for (const p of pages) {
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    (groups[dir] = groups[dir] || []).push(p);
  }
  const nav = Object.keys(groups).sort().map(dir =>
    (dir ? \`<a class="dir">\${dir}</a>\` : "") + groups[dir].map(p =>
      \`<a href="#/\${project}/\${p}" class="\${p === rel ? "active" : ""}">\${p.split("/").pop().replace(/\\.md$/, "")}</a>\`
    ).join("")
  ).join("");

  view.innerHTML = \`<div id="wrap"><nav>\${nav}</nav>
    <main><div class="crumb">\${project} / \${rel}</div><article></article></main></div>\`;
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
  window.scrollTo(0, 0);
}

async function results(term) {
  const hits = await api("/api/search?q=" + encodeURIComponent(term));
  view.innerHTML = '<div id="results">' + (hits.length ? hits.map(h =>
    \`<div class="hit" onclick="location.hash='#/\${h.project}/\${h.page}'">
       <b>\${h.project} / \${h.page}</b><div>…\${h.snippet}…</div></div>\`
  ).join("") : "<p>no matches</p>") + "</div>";
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
addEventListener("hashchange", () => { q.value = ""; route(); });
route();
</script>`;

server.listen(PORT, HOST, () => {
  console.log(
    `wikiport: http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}` +
      `  (${SINGLE ? "wiki: " + SINGLE : "workspace: " + ROOT})`,
  );
});
