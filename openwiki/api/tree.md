---
type: endpoint
title: /api/tree
description: "Get the page tree for a project with title metadata"
---

# GET /api/tree

Returns the file tree for a project, with page titles extracted from frontmatter.

## Request

```
GET /api/tree?project=api-service
```

**Query parameter:**
- `project` (string): Project name. In workspace mode, must match a project returned by `/api/projects`. In single mode, ignored.

## Response

JSON array of page objects, sorted by path:

```json
[
  {
    "rel": "quickstart.md",
    "title": "Quickstart"
  },
  {
    "rel": "overview.md",
    "title": "Overview"
  },
  {
    "rel": "core/index.md",
    "title": "Core Server"
  },
  {
    "rel": "api/index.md",
    "title": "API Endpoints"
  }
]
```

## Fields

- **rel** (string): Relative path from the openwiki/ root, using forward slashes (e.g., `core/index.md`, `api/page.md`).
- **title** (string): Page title, extracted from the frontmatter `title` field. If not present, derived from the filename:
  - For `index.md`, title is `"dir overview"` (e.g., `core/index.md` → `"core overview"`)
  - For root `index.md`, title is `"Overview"`
  - For other files, title is the filename without `.md`

## Sorting

Pages are sorted alphabetically by their relative path. This produces a consistent reading order: root pages first (alphabetically), then each subdirectory (alphabetically), then pages within each directory (alphabetically).

The client uses this order for sidebar navigation and prev/next pagination.

## Error Handling

If the project is invalid or not found:
- In workspace mode: Invalid project name → returns `[]`
- In single mode: Invalid project → returns `[]`
- Any error reading the tree → returns `[]`

## Implementation

Implemented in the `/api/tree` handler (server.js:244-265):

```javascript
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
  .sort((a, b) => a.rel.localeCompare(b.rel))
```

Calls walk() to find all markdown files, then fm() to extract titles from frontmatter.

## Usage by Client

Called by tree() (server.js:533-535) to fetch the page tree, then used by page() (server.js:559-598) to:
1. Build the sidebar navigation menu
2. Map page titles for display
3. Generate the reading order for prev/next pagination

```javascript
async function tree(project) {
  if (!trees[project]) trees[project] = await api("/api/tree?project=" + project);
  return trees[project];
}
```

## Next Steps

Explore the page endpoint: [[page]]. Or learn about file access: [[../core/file-access]].
