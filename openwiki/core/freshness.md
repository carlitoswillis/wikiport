---
type: system
title: Freshness Tracking
description: "How wikiport detects if documentation lags behind the source code"
---

# Freshness Tracking

Wikiport compares each wiki's documented git HEAD (recorded by OpenWiki) against the repository's current HEAD. This produces a freshness badge shown on project cards.

## freshness(repoDir, wiki) — server.js:79-108

Returns a freshness object: `{ state, behind }`.

**Parameters**:
- `repoDir`: Path to the repository root (not the wiki folder)
- `wiki`: Path to the openwiki folder

**Return value**:
- `{ state: "current", behind: 0 }` — Docs are up to date
- `{ state: "behind", behind: N }` — Docs are N commits behind
- `{ state: "unknown", behind: 0 }` — Cannot determine (no git, missing metadata, error)

## Implementation

### Step 1: Read .last-update.json

OpenWiki records metadata in `.last-update.json` at the wiki root (server.js:84-86):

```json
{
  "gitHead": "abc123def456..."
}
```

If this file doesn't exist or lacks a `gitHead`, return `{ state: "unknown", behind: 0 }`.

### Step 2: Get Current HEAD

Execute `git -C repoDir rev-parse HEAD` to get the current commit SHA (server.js:88-90):

```javascript
const head = execFileSync("git", ["-C", repoDir, "rev-parse", "HEAD"], {
  timeout: 3000, stdio: ["ignore", "pipe", "ignore"],
}).toString().trim();
```

If this fails (no git installed, not a repo, etc.), return `{ state: "unknown", behind: 0 }`.

### Step 3: Compare

**If heads match exactly** (server.js:91):
```javascript
if (head === meta.gitHead) v = { state: "current", behind: 0 };
```

**If heads differ**, count commits between the recorded HEAD and current HEAD (server.js:92-100):

```javascript
const n = Number(
  execFileSync(
    "git",
    ["-C", repoDir, "rev-list", "--count", meta.gitHead + "..HEAD"],
    { timeout: 3000, stdio: ["ignore", "pipe", "ignore"] },
  ).toString().trim(),
);
v = { state: "behind", behind: Number.isFinite(n) && n > 0 ? n : 1 };
```

This uses `git rev-list --count ref1..ref2` to count commits reachable from ref2 but not ref1. If count is invalid or zero, default to 1.

## Caching

Freshness checks spawn git processes, which is slow. Results are cached in `freshCache` (server.js:78) for 30 seconds per repo (server.js:81):

```javascript
const freshCache = new Map();
function freshness(repoDir, wiki) {
  const hit = freshCache.get(repoDir);
  if (hit && Date.now() - hit.t < 30_000) return hit.v;
  // ... compute freshness ...
  freshCache.set(repoDir, { t: Date.now(), v });
  return v;
}
```

Each request to list projects triggers a freshness check for each project, so caching keeps the home page responsive.

## UI Badge

The badge() function (server.js:511-514) renders freshness as:
- Nothing if state is "unknown"
- " · <i class=\"fresh ok\">current</i>" if state is "current"
- " · <i class=\"fresh stale\">behind N commit(s)</i>" if state is "behind"

Shown on project cards in the home grid.

## Error Handling

All git operations are wrapped in try-catch. If any step fails (git not installed, repo corrupted, timeout), freshness returns `{ state: "unknown", behind: 0 }`. This ensures wikiport never crashes or stalls waiting for git.

## Used By

- **listProjects()**: Calls freshness() for each project and includes the badge in the response
- **Client home()**: Renders the badge on project cards
- **Page display**: Shows the badge on the page crumb line

## Next Steps

Learn about the HTTP API: [[../api/index]]. Or return to [[index]].
