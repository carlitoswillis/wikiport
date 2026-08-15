# wikiport

A clean local viewer for [OpenWiki](https://github.com/langchain-ai/openwiki) documentation — one repo, or a whole workspace of them, in a single portal.

OpenWiki writes great markdown for agents; wikiport makes it pleasant for humans:

- **Workspace mode** — point it at a folder of repos and get a home page of every wiki, with full-text search across all of them
- **Wikilinks that work** — `[[page]]` and `[[page|label]]` render as real links; references to pages that don't exist are marked, which doubles as a docs linter
- **Mermaid diagrams, tables, dark mode** — follows your system theme
- **Zero dependencies** — one file, Node's stdlib only; markdown renders client-side
- **Local-first** — binds `127.0.0.1` by default; opt into LAN/VPN exposure explicitly

## Use

```sh
npx wikiport ~/workspace          # portal over every repo with an openwiki/
npx wikiport .                    # single repo (auto-detected)
npx wikiport ~/ws --port 7747 --host 0.0.0.0   # reachable over Tailscale/LAN
```

Then open http://127.0.0.1:7747.

## Notes

- Pages are read fresh from disk on every request — regenerate or update your wikis (`openwiki --update`) and just refresh the browser.
- `_skeleton.md` and dotfiles are hidden.
- marked and mermaid load from jsdelivr in the browser; everything else is offline.

MIT.
