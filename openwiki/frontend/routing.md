---
type: system
title: Client-Side Routing
description: "Hash-based routing system for single-page navigation"
---

# Client-Side Routing

Wikiport uses hash-based routing to navigate between pages without server round-trips. The `route()` function reads the current hash and displays the appropriate view.

## Route Format

```
#/                              → Home page (grid of projects)
#/project-name                  → Default page in project (quickstart.md or index.md)
#/project-name/core/index.md    → Specific page in project
```

The hash is the only source of truth for navigation. Everything is bookmarkable and shareable.

## Main Router: route() — server.js:687-692

```javascript
function route() {
  const parts = location.hash.replace(/^#\\\\/, "").split("/");
  const project = parts[0];
  if (!project) return home();
  page(project, parts.slice(1).join("/") || null);
}
```

**Logic**:
1. Parse the hash: `#/project-name/path/to/page.md` → `["project-name", "path/to/page.md"]`
2. Extract project name (parts[0])
3. If no project (empty hash), show home()
4. Else show page(project, path)

## Event Listener — server.js:693

```javascript
addEventListener("hashchange", () => {
  q.value = "";        // Clear search box
  syncSearchScope();    // Update search placeholder
  route();              // Re-route to new hash
});
```

This fires every time the hash changes, either from user clicks or programmatic `location.hash` assignment.

## Navigation Methods

**Click-based**: User clicks a link in the sidebar or pager:
```html
<a href="#/project-name/core/index.md">Core Server</a>
```
The browser updates the hash, triggering hashchange, which calls route().

**Programmatic**: Code sets `location.hash`:
```javascript
location.hash = '#/api-service/quickstart.md';
```

Both methods trigger the same hashchange event.

## Search Integration

When the user types in the search box (server.js:678-685):
1. Fetch results for the query (via /api/search)
2. Display results (not a route; view is replaced)
3. When the user clicks a result, set location.hash to navigate to that page
4. The hashchange event fires, route() is called, and the page is displayed

So search is a temporary view; navigating to a page is the real "route".

## Single vs Workspace Mode Routing

**Single mode** (`SINGLE = path/to/openwiki`):
- Routes look like `#/quickstart.md` or `#/core/index.md`
- No project prefix (there's only one project)

**Workspace mode** (`SINGLE = null`):
- Routes look like `#/api-service/quickstart.md` or `#/web-frontend/core/index.md`
- Project name is always the first segment

The route() function handles both via wikiDir(project), which uses SINGLE to resolve the correct openwiki/ folder.

## Sidebar Navigation

The page() function builds the sidebar from the page tree (server.js:587-598):

```javascript
const nav = orderedDirs.map(dir => {
  const dirIndex = dir ? dir + "/index.md" : null;
  const items = groups[dir].filter(p => p !== dirIndex);
  return header + items.map(p =>
    `<a href="#/${project}/${p}" class="${p === rel ? "active" : ""}">...
  ).join("");
}).join("");
```

Each page link includes the project and relative path. Clicking any link triggers navigation.

## Pagination

Prev/next links (server.js:643-647) also use hash routes, following reading order (quickstart → root pages → sections → alphabetically).

## Relative Markdown Links

<!-- openwiki: broken internal link [../other/page.md] file "../other/page.md" does not exist. Fix the href or restore the target, then delete this comment. -->
In markdown content, relative links like `[text](../other/page.md)` are converted to hash routes (server.js:607-616):

```javascript
const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "";
for (const a of article.querySelectorAll("a")) {
  const href = a.getAttribute("href") || "";
  if (/^https?:/.test(href)) continue;  // Absolute URLs unchanged
  const clean = href.split("#")[0];
  if (!clean.endsWith(".md")) continue;  // Only .md files
  const target = new URL(clean, "http://x/" + dir).pathname.slice(1);
  a.setAttribute("href", "#/" + project + "/" + target);
}
```

This resolves relative paths against the current page's directory, then converts to a hash route.

## Search Scope

syncSearchScope() (server.js:501-504) updates the search box placeholder:

```javascript
function syncSearchScope() {
  const p = currentProject();
  q.placeholder = p ? `search ${p}…` : "search all wikis…";
}
```

In a single project route, search is scoped to that project. In home (no project), search spans all projects.

## Next Steps

Learn about rendering: [[rendering]]. Or return to [[index]].
