---
type: system
title: Mode Detection
description: "How wikiport determines workspace mode versus single-repo mode"
---

# Mode Detection

Wikiport auto-detects whether you're pointing it at a workspace (many repos) or a single repo, and stores this in the global `SINGLE` variable.

## Detection Logic

The detection happens in two steps (server.js:42-67):

### Step 1: isWorkspace(root) — server.js:46-60

Returns true if ANY immediate child of root has an `openwiki/` subdirectory.

```javascript
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
```

**Why `.some()` instead of checking every child?** The first child with a wiki signals workspace mode. This makes detection fast and unambiguous.

### Step 2: Determine SINGLE — server.js:61-67

```javascript
const SINGLE = isWorkspace(ROOT)
  ? null
  : hasPages(path.join(ROOT, "openwiki"))
    ? path.join(ROOT, "openwiki")
    : path.basename(ROOT) === "openwiki" && hasPages(ROOT)
      ? ROOT
      : null;
```

**Logic:**
- If workspace mode (isWorkspace returned true), `SINGLE = null`.
- Else if `ROOT/openwiki/` exists and has pages, `SINGLE = ROOT/openwiki`.
- Else if ROOT itself is named `openwiki` and has pages, `SINGLE = ROOT`.
- Else `SINGLE = null` (no wiki found).

## Precedence

**Workspace mode wins** if ANY repo has a wiki. This prevents misidentification: a workspace containing a repo literally named `openwiki` is correctly identified as workspace mode, not single mode.

## Helper: hasPages(dir)

**server.js:34-40** — Returns true if walk(dir) finds at least one markdown file.

## Modes Explained

### Workspace Mode (SINGLE = null)

Root is a directory containing multiple repos:

```
workspace/
  repo-a/
    openwiki/
      quickstart.md
  repo-b/
    openwiki/
      quickstart.md
```

Behavior:
- Home page shows a grid of all projects with wikis.
- Search is global (scoped by project in results).
- Routes: `#/repo-a/quickstart.md`, `#/repo-b/quickstart.md`, etc.

### Single Mode (SINGLE = path/to/openwiki or path/to/openwiki/)

Root is either a repo with an `openwiki/` folder, or the `openwiki/` folder itself:

```
repo/
  openwiki/
    quickstart.md
```

Or point directly at:

```
openwiki/
  quickstart.md
```

Behavior:
- Home page shows only that one wiki.
- Routes: `#/quickstart.md`, `#/path/to/page.md`, etc.
- Project name in the home card is `path.basename(path.dirname(SINGLE))` or "wiki" if not found.

## Usage in wikiDir()

**server.js:69-72** — The wikiDir() function uses SINGLE to resolve which openwiki/ folder to access:

```javascript
function wikiDir(project) {
  if (SINGLE) return SINGLE;  // Single mode: always return THE wiki
  if (!/^[\w.-]+$/.test(project)) return null;  // Validate project name
  return path.join(ROOT, project, "openwiki");  // Workspace mode: build path
}
```

In workspace mode, the project name is validated against a regex to prevent path traversal.

## Next Steps

Learn about project discovery: [[project-discovery]]. Or return to [[index]].
