---
type: system
title: File Access
description: "Safe file reading, path validation, directory traversal, and frontmatter extraction"
---

# File Access

Wikiport safely reads markdown files from disk with strict path validation to prevent directory traversal attacks. Key functions: `walk()` for directory traversal, `safePage()` for secure file access, and `fm()` for frontmatter extraction.

## walk(dir, base) — server.js:157-170

Recursively finds all markdown files in a directory and returns metadata about them.

**Returns**: Array of objects `{ rel, mtime }`:
- `rel` (string): Path relative to base directory
- `mtime` (number): File modification time (milliseconds since epoch)

**Behavior**:
1. Recursively walk all subdirectories
2. Skip entries starting with `.` (dotfiles and `.git`)
3. Skip `_skeleton.md` (OpenWiki temp file)
4. Collect all `.md` files
5. Return sorted by default filesystem order

**Example**:

```javascript
walk("/openwiki")
// [
//   { rel: "quickstart.md", mtime: 1723589400000 },
//   { rel: "overview.md", mtime: 1723589300000 },
//   { rel: "core/index.md", mtime: 1723589200000 }
// ]
```

## safePage(project, rel) — server.js:174-185

Securely resolves a project/path pair to a file and returns its contents, or null if access is denied.

**Security checks**:
1. Resolve project to a wiki directory using wikiDir() (which validates the project name)
2. Resolve the full path: `path.resolve(wiki, rel)`
3. **Path traversal check**: Ensure the resolved path starts with the wiki directory + path separator. This blocks `../` escapes.
4. **File type check**: Ensure the path ends with `.md` (no arbitrary file types)
5. **Read the file**: Return its contents as UTF-8, or null if the file does not exist

**Example**:

```javascript
safePage("api-service", "core/index.md")
// Resolves to: /workspace/api-service/openwiki/core/index.md
// Returns: markdown file contents (or null if not found)

safePage("api-service", "../../../etc/passwd")
// Path traversal blocked; returns null

safePage("api-service", "config.json")
// File type check fails (.json, not .md); returns null
```

## fm(file, key) — server.js:147-155

Extracts a frontmatter field from a markdown file without parsing the full YAML. Used to get page titles and descriptions without heavy YAML parsing.

**Behavior**:
1. Read the first 600 bytes of the file (frontmatter is usually in the first few lines)
2. Use a regex to find the pattern: `key: value`
3. Return the trimmed value (quotes stripped), or null if not found

**Example**:

```javascript
fm("/openwiki/overview.md", "title")
// "Overview"

fm("/openwiki/overview.md", "description")
// "What wikiport is, why it exists, and its core design philosophy"

fm("/openwiki/nonexistent.md", "title")
// null (file not found)
```

This is a cheap operation perfect for bulk metadata extraction.

## Frontmatter Format

Expected YAML frontmatter at the top of each `.md` file:

```markdown
---
type: guide
title: Quickstart
description: "Get started with wikiport"
---

# Quickstart
...
```

The `fm()` function extracts individual fields. The client-side renderer strips the entire frontmatter block before rendering markdown.

## Dotfile Handling

Walk skips:
- `.git/` (version control)
- `.env` (secrets, not read)
- `.hidden/` (user files)
- Any file/directory starting with `.`
- `_skeleton.md` (OpenWiki temp)

## Used By

- **listProjects()**: Calls walk() to count pages and find latest update time; calls fm() to extract descriptions
- **Tree endpoint**: Calls walk() and fm() to build the page tree with titles
- **Page endpoint**: Calls safePage() to safely read markdown
- **Search function**: Calls walk() to iterate pages, reads each with fs.readFileSync (not safePage, but same validation logic applies)

## Next Steps

Learn about freshness tracking: [[freshness]]. Or explore API endpoints: [[../api/index]].
