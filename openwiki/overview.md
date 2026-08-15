---
type: concept
title: Overview
description: "What wikiport is, why it exists, and its core design philosophy"
---

# Overview

Wikiport is a zero-dependency local viewer for [OpenWiki](https://github.com/langchain-ai/openwiki) documentation. It transforms a directory of OpenWiki-generated markdown files into a clean, searchable, browsable portal—either for a single repository or an entire workspace of projects.

## Why Wikiport Exists

OpenWiki generates excellent markdown documentation for agents and engineers to understand codebases. But markdown files alone lack navigation, search, and a unified reading experience. Wikiport fills that gap with a browser-based portal that:

- **Works with OpenWiki output as-is** — no additional configuration or build steps
- **Runs locally** — single-file Node.js server, zero npm dependencies, browser-side rendering
- **Scales from one repo to a workspace** — auto-detects whether you're viewing a single wiki or browsing many
- **Makes wikilinks real** — `[[page]]` references become live navigation
- **Renders Mermaid diagrams** — flowcharts, state machines, entity relationships, sequence diagrams
- **Searches across all wikis** — multi-term AND search ranked by relevance

## Design Principles

**Zero dependencies**: A single `server.js` file using only Node's standard library. Markdown rendering and Mermaid diagramming happen client-side via CDN, so no npm bloat and minimal attack surface.

**Local-first**: Binds to `127.0.0.1:7747` by default. Never exposes documentation to the public internet. You can opt into LAN/VPN access with `--host 0.0.0.0` for self-hosting behind a firewall.

**Stateless and simple**: Pages are read fresh from disk on every request. Regenerate your wikis (with `openwiki --update`) and just refresh the browser—no cache invalidation headaches.

**Markdown-native**: Works directly with `.md` files. Respects YAML frontmatter for page titles and descriptions. Renders relative links as in-app navigation, so you can link between pages naturally.

## Core Architecture

Wikiport has two halves:

1. **Server** (`server.js`): Node.js HTTP server that:
   - Detects whether you're in workspace or single-repo mode
   - Discovers and lists projects and their pages
   - Serves 5 HTTP endpoints: `/api/projects`, `/api/tree`, `/api/page`, `/api/search`, and the HTML home page
   - Validates file paths to prevent traversal attacks

2. **Client**: Single-page app in the browser that:
   - Routes based on hash fragments (`#/project/path/to/page`)
   - Fetches markdown from the server API
   - Renders with [marked](https://marked.js.org/) and [Mermaid](https://mermaid.js.org/)
   - Resolves wikilinks, generates tables of contents, and handles search

## Modes

**Workspace mode**: Point wikiport at a directory full of repos. Each repo with an `openwiki/` folder appears as a separate card on the home page. Search and navigation work across all of them.

**Single mode**: Point wikiport at a repo with an `openwiki/` folder (or directly at the `openwiki/` folder). Just that one wiki is displayed. Perfect for focused documentation browsing.

Mode is auto-detected based on what you pass as the root directory.

## Key Features

- **Wikilinks**: `[[page]]` and `[[page|label]]` render as real links. Broken references are visually marked so you can spot missing documentation.
- **Mermaid diagrams**: All `​\`\`\`mermaid` blocks render in the browser as interactive SVG diagrams.
- **Responsive UI**: Works on desktop (with sidebar and TOC), tablet (collapsed nav), and mobile (hamburger menu).
- **Dark mode**: Follows system theme preference.
- **Freshness tracking**: Compares each wiki's documented git HEAD against the repo's current HEAD; shows whether docs are current or behind.
- **Full-text search**: Multi-term AND search, ranked: title match, path match, heading match, body match. Results capped at 50 per query. Scoped to a single wiki or across the workspace.

## Next Steps

- **Get started**: See [[quickstart]] for installation and usage.
- **Understand the server**: [[core/index]] explains mode detection, project discovery, and file access.
- **Explore the API**: [[api/index]] documents all 5 endpoints.
- **Learn the frontend**: [[frontend/index]] covers routing, rendering, and the UI system.
