---
type: system
title: Project Discovery
description: "How wikiport discovers and lists projects and their metadata"
---

# Project Discovery

The `listProjects()` function discovers available projects and collects metadata about them: page count, last update time, description, and freshness relative to git HEAD.

## listProjects() — server.js:110-142

Returns an array of project objects, one per project with a wiki.

### Workspace Mode

In workspace mode (`SINGLE = null`), the function iterates every child of ROOT:

1. Try to stat `ROOT/child/openwiki`
2. If it exists and is a directory, walk it to find markdown files
3. If pages are found, extract metadata:
   - `name`: the child directory name
   - `pages`: count of markdown files
   - `updated`: max mtime across all pages (Unix timestamp)
   - `desc`: from `quickstart.md` or `index.md` frontmatter `description` field
   - `fresh`: result of freshness() function (see [[freshness]])

Result is sorted alphabetically by project name.

### Single Mode

In single mode (`SINGLE` is a path), the function returns a single-element array:

```javascript
const pages = walk(SINGLE);
return [{
  name: path.basename(path.dirname(SINGLE)) || "wiki",
  pages: pages.length,
  updated: Math.max(...pages.map((p) => p.mtime)),
}];
```

The project name is derived from the parent of the `openwiki/` folder (or "wiki" if not found).

## Metadata Fields

- **name** (string): Project identifier, safe for URLs
- **pages** (number): Count of markdown files (excluding `_skeleton.md` and dotfiles)
- **updated** (number): Unix timestamp of most recently modified page
- **desc** (string, optional): Project description from frontmatter
- **fresh** (object, optional): Freshness status from freshness() function with `state` and `behind` count

## Discovery Example

Given workspace:

```
~/workspace/
  api-service/
    openwiki/
      quickstart.md (description: "API service docs")
      core/
        index.md
  web-frontend/
    openwiki/
      quickstart.md
```

listProjects() returns:

```javascript
[
  {
    name: "api-service",
    pages: 2,
    updated: 1723589400000,
    desc: "API service docs",
    fresh: { state: "current", behind: 0 }
  },
  {
    name: "web-frontend",
    pages: 1,
    updated: 1723589300000,
    fresh: { state: "behind", behind: 3 }
  }
]
```

## Page Counting

The `walk()` function (see [[file-access]]) recursively finds all `.md` files in a directory, excluding:
- Files and directories starting with `.` (dotfiles)
- `_skeleton.md` (the skeleton file used during wiki generation)

This ensures the page count reflects only published documentation.

## Used By

- **Client**: home() function fetches this list to render the home grid
- **Server**: Validation that a project exists when processing search or tree requests

## Next Steps

Learn about safe file access: [[file-access]]. Or explore how projects get their freshness badges: [[freshness]].
