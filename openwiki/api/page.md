---
type: endpoint
title: /api/page
description: "Get raw markdown content of a single page"
---

# GET /api/page

Returns the raw markdown content of a single page.

## Request

```
GET /api/page?project=api-service&path=core/index.md
```

**Query parameters:**
- `project` (string): Project name. In single mode, ignored.
- `path` (string): Relative path to the markdown file (e.g., `core/index.md`, `quickstart.md`).

## Response

Plaintext markdown (Content-Type: `text/plain; charset=utf-8`):

```markdown
---
type: system
title: Core Server
description: "Main server implementation: mode detection, project discovery, file access, API endpoints"
---

# Core Server

The core server (`server.js`) handles project discovery, page access, search, and HTTP routing.
...
```

Includes the full YAML frontmatter and markdown body.

## Error Handling

If the page is not found or access is denied:

- Returns HTTP 404 with body `"not found"`
- Possible reasons:
  - Invalid project name (not found or validation failed)
  - Invalid path (file doesn't exist or escaped the openwiki/ directory)
  - Path doesn't end with `.md`

## Security

File access is validated by safePage() (server.js:174-185), which enforces:
1. **Project name validation**: In workspace mode, project name must match regex `/^[\w.-]+$/`
2. **Path traversal prevention**: Resolved path must be within the openwiki/ directory
3. **File type check**: Path must end with `.md`

These checks prevent accessing files outside the wiki or arbitrary file types.

## Implementation

Implemented in the `/api/page` handler (server.js:267-277):

```javascript
const body = safePage(
  url.searchParams.get("project") || "",
  url.searchParams.get("path") || "",
);
if (body === null) {
  res.writeHead(404);
  return res.end("not found");
}
res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
res.end(body);
```

Calls safePage() which uses wikiDir() to resolve the project and then validates the path. See [[../core/file-access]] for details.

## Usage by Client

Called by the page() function (server.js:559-649) to fetch the markdown for a page:

```javascript
async function page(project, rel) {
  const raw = await (await fetch(`/api/page?project=${project}&path=${encodeURIComponent(rel)}`)).text();
  const md = resolveWikilinks(stripFrontmatter(raw), pages);
  // Parse and render the markdown
}
```

The client then:
1. Strips the frontmatter (server.js:554-557)
2. Resolves wikilinks like `[[page]]` (server.js:541-552)
3. Parses and renders the markdown with marked.js (server.js:605)
4. Processes Mermaid diagrams (server.js:619-628)
5. Converts relative `.md` links to in-app routes (server.js:607-616)

## Next Steps

Explore the search endpoint: [[search]]. Or learn about rendering: [[../frontend/rendering]].
