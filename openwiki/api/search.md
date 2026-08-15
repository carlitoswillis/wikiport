---
type: endpoint
title: /api/search
description: "Full-text search with multi-term AND matching and relevance ranking"
---

# GET /api/search

Performs a full-text search across one or more projects, returning ranked results.

## Request

```
GET /api/search?q=api+routing&project=api-service
GET /api/search?q=authentication
```

**Query parameters:**
- `q` (string): Search query (2+ characters required; shorter queries return `[]`)
- `project` (string, optional): Scope search to a single project. If omitted, search is across all projects.

## Response

JSON array of up to 50 result objects, sorted by relevance score (highest first):

```json
[
  {
    "project": "api-service",
    "page": "core/routing.md",
    "title": "Request Routing",
    "score": 12,
    "snippet": "…HTTP server routing system. The route() function handles hash-based navigation…"
  },
  {
    "project": "api-service",
    "page": "api/index.md",
    "title": "API Endpoints",
    "score": 8,
    "snippet": "…all endpoints that the client calls to fetch projects, pages, and search results…"
  }
]
```

## Fields

- **project** (string): Project name
- **page** (string): Relative path to the page
- **title** (string): Page title
- **score** (number): Relevance score (higher = more relevant)
- **snippet** (string): Context around the first search term (60 chars before, ~110 after), with term trimmed

## Search Behavior

**Multi-term AND matching**: All terms in the query must appear in the page (case-insensitive). For example, `api routing` will only match pages containing both "api" and "routing".

**Ranking algorithm** (server.js:205-214):
1. Base score: 1 point
2. Title match: +4 points per matching term
3. Path match: +3 points per matching term
4. Heading match: +2 points (any heading in the page)
5. Body contains term: +1 point (baseline)

Results are sorted by score descending, then truncated to 50.

**Snippet**: 60 characters before the first matching term to ~110 characters after, with extra whitespace collapsed and trimmed.

## Error Handling

If the query is too short (< 2 characters) or malformed:
- Returns `[]` (empty array)

If the project is invalid or not found:
- Returns `[]` (empty array)
- The search continues across other valid projects if no project scope is specified

## Implementation

Implemented by search() function (server.js:189-230):

1. Parse query into lowercase terms, split on whitespace
2. Return `[]` if no terms
3. For each project (or the scoped project):
   a. Walk the wiki directory
   b. For each page, read its full text
   c. If all terms appear in the page (case-insensitive AND matching):
      - Extract title from frontmatter or filename
      - Calculate score based on title/path/heading/body matches
      - Extract snippet around first term
      - Add to results
4. Sort by score descending
5. Return top 50 results

```javascript
function search(q, project) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits = [];
  const projects = listProjects().filter((p) => !project || p.name === project);
  for (const proj of projects) {
    const wiki = wikiDir(proj.name);
    for (const page of walk(wiki)) {
      const text = fs.readFileSync(path.join(wiki, page.rel), "utf8");
      const lower = text.toLowerCase();
      if (!terms.every((t) => lower.includes(t))) continue;
      // Score and add to hits
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 50);
}
```

## Usage by Client

Called by results() function (server.js:661-676) when the search box receives input (2+ characters):

```javascript
async function results(term) {
  const scope = currentProject();
  const hits = await api(
    "/api/search?q=" + encodeURIComponent(term) +
    (scope ? "&project=" + encodeURIComponent(scope) : "")
  );
  // Highlight search terms in snippets and render results
}
```

The client:
1. Highlights matching terms in each snippet
2. Renders clickable result cards
3. Updates dynamically as the user types (with 250ms debounce)

## Next Steps

Explore search UI: [[../frontend/search]]. Or return to [[index]].
