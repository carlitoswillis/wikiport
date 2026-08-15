---
type: endpoint
title: /api/projects
description: "Get list of all available projects and their metadata"
---

# GET /api/projects

Returns a list of all available projects (in workspace mode) or the single project (in single mode).

## Request

```
GET /api/projects
```

No query parameters.

## Response

JSON array of project objects:

```json
[
  {
    "name": "api-service",
    "pages": 42,
    "updated": 1723589400000,
    "desc": "API service documentation",
    "fresh": {
      "state": "current",
      "behind": 0
    }
  },
  {
    "name": "web-frontend",
    "pages": 28,
    "updated": 1723589300000,
    "desc": "Frontend application guide",
    "fresh": {
      "state": "behind",
      "behind": 5
    }
  }
]
```

## Fields

- **name** (string): Project identifier, safe for URLs. In single mode, derived from the parent directory of `openwiki/` (or "wiki" if not found).
- **pages** (number): Count of markdown files in the project.
- **updated** (number): Unix timestamp (milliseconds) of the most recently modified page.
- **desc** (string, optional): Project description extracted from the `description` field in the frontmatter of `quickstart.md` or `index.md`.
- **fresh** (object, optional): Freshness status relative to git HEAD. Only present in workspace mode.
  - **state** (string): One of "current", "behind", "unknown".
  - **behind** (number): Number of commits the docs are behind (0 if current, 1+ if behind).

## Mode Behavior

### Workspace Mode

Returns all projects with wikis under ROOT. Each project is a child directory with an `openwiki/` folder. Projects are sorted alphabetically by name. Freshness checks are performed for each project (results cached for 30 seconds).

### Single Mode

Returns a single-element array with the one project. Freshness is not included (only available in workspace mode).

## Implementation

Implemented by listProjects() (server.js:110-142). See [[../core/project-discovery]] for details.

## Usage by Client

Called by home() function (server.js:523-530) to render the home grid of project cards:

```javascript
async function home() {
  const projects = await api("/api/projects");
  // Render cards, each showing name, desc, page count, last update time, and freshness badge
}
```

## Next Steps

Explore the tree endpoint: [[tree]]. Or learn about project discovery: [[../core/project-discovery]].
