---
type: guide
title: Quickstart
description: "Get started with wikiport: install, run, and navigate OpenWiki documentation"
---

# Quickstart

Wikiport is a zero-dependency local viewer for [OpenWiki](https://github.com/langchain-ai/openwiki) documentation. Point it at a repo or workspace and browse your wikis in a clean, searchable portal.

## Installation

```sh
npm install -g wikiport
# or run directly
npx wikiport
```

Node 18+ required.

## Usage

```sh
# View a single repo's wiki
wikiport /path/to/repo

# Browse all wikis in a workspace
wikiport ~/workspace

# Custom port and host
wikiport . --port 8080 --host 0.0.0.0
```

Then open http://127.0.0.1:7747 (or your chosen port).

## Modes

Wikiport auto-detects how to run:

- **Workspace mode**: Point at a directory containing multiple repos. Each repo with an `openwiki/` folder appears as a separate wiki in the home grid with full-text search across all of them.
- **Single mode**: Point at a repo with an `openwiki/` folder, or point directly at an `openwiki/` folder. Just that one wiki is displayed.

## Features

- **Wikilinks**: `[[page]]` and `[[page|label]]` render as real navigation links. Broken links (no matching page) are marked so you can spot missing docs.
- **Mermaid diagrams**: Flowcharts, state machines, entity relationships, and sequence diagrams render client-side.
- **Dark mode**: Follows your system theme.
- **Full-text search**: Multi-term AND search, ranked by relevance. Scoped to a single wiki or across the entire workspace.
- **Local-first**: Binds `127.0.0.1` by default. Pass `--host 0.0.0.0` to expose over LAN/VPN (e.g., Tailscale). Never expose to the public internet.
- **Zero dependencies**: Single Node.js file using only stdlib; markdown and mermaid load from CDN in the browser.

## Navigation

**Home**: Grid of available wikis (workspace mode) or single wiki card (single mode).

**Search**: Type 2+ characters in the search box to search. Results show title, location, and a snippet.

**Pages**: Click a wiki to view its pages. The sidebar shows the full page tree. Click a page to read it.

**On-page navigation**: 
- Table of contents (right sidebar on desktop, hidden on mobile) shows h2 headings.
- Previous/next pagination at the bottom follows reading order: quickstart → root pages → sections with their index pages → alphabetically within each section.

## Freshness

Wikiport compares each wiki's documented git HEAD (from `.last-update.json`) against the repo's current HEAD. A badge shows whether docs are current or behind (and by how many commits). This is cached for 30 seconds per repo.

## Configuration

Environment variables:
- `WIKIPORT_ROOT` — defaults to current directory
- `WIKIPORT_PORT` — defaults to 7747
- `WIKIPORT_HOST` — defaults to 127.0.0.1

Or pass them as command-line flags: `--port 8000 --host 0.0.0.0`.

## Common Tasks

| Task | How |
|------|-----|
| View a wiki | Click a project card on the home grid, or navigate directly: `#/project-name` |
| Search across all | Use the top search box in workspace mode |
| Search one wiki only | Navigate to a wiki, then use the search box (scoped to that wiki) |
| Jump to a page | Use search or click the page name in the sidebar |
| Read offline | Pages are fetched fresh on each request; refresh your browser to pick up updated wikis |
| Self-host | Run with `--host 0.0.0.0` and reverse-proxy it, but never expose to the public internet |

## Next Steps

See [[overview]] for an explanation of what wikiport does and why it exists. Explore [[core/index|Core systems]] to understand how the server works, or [[frontend/index|Frontend]] for the client-side architecture.
