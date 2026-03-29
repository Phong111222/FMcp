# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

pnpm workspace with three MCP server packages, each a standalone TypeScript process communicating over stdio:

```
mcp-dir/
├── bitbucket/   — Bitbucket REST API 2.0 MCP server
├── jira/        — Jira REST API MCP server (stub)
├── trello/      — Trello REST API v1 MCP server (full)
├── dist/        — Root build output (shared across all packages)
│   ├── bitbucket/index.js
│   ├── jira/index.js
│   └── trello/index.js
└── tsconfig.json — Base TS config extended by each package
```

## Commands

```bash
# Install all dependencies (run from root)
pnpm install

# Build all servers → dist/{bitbucket,jira,trello}/
pnpm run build

# Build a single server
pnpm --filter trello-mcp run build
pnpm --filter bitbucket-mcp run build
pnpm --filter jira-mcp run build

# Watch mode for a single server (no build step, loads .env automatically)
pnpm --filter trello-mcp run dev

# Type-check all packages
pnpm run typecheck

# Clean root dist folder
pnpm run clean
```

## MCP Server Pattern

Every server in this repo follows the same structure in `src/index.ts`:

1. **Auth validation** — Read env vars at module top-level, `process.exit(1)` with a clear message if missing. Never validate lazily inside tool handlers.
2. **`*Fetch` helper** — Single async function that handles auth headers/params and throws a descriptive `Error` on non-2xx responses.
3. **`errorContent` helper** — Converts thrown errors into MCP error content (`{ type: "text", text, isError: true }`). Every tool wraps its logic in try/catch and returns this on failure.
4. **`server.tool(name, description, zodSchema, asyncHandler)`** — Tool registration using `McpServer` from `@modelcontextprotocol/sdk`.
5. **`main()`** — Connects `StdioServerTransport`. Nothing writes to stdout after `server.connect()` — stdout is the MCP wire protocol. Use `console.error` for all logging.

## API-Specific Notes

### Trello (`trello/src/index.ts`) — 24 tools (boards, lists, cards, checklists, comments)
- Auth: `key` + `token` appended as URL query params to every request
- **Mutations (POST/PUT) use query params, not JSON body** — Trello v1 ignores request bodies
- `fields` param is a comma-delimited string: `fields=id,name,url`
- Boolean values in query params must be strings: `"true"` / `"false"`
- Never write to stdout after `server.connect()` — use `console.error` only

### Bitbucket (`bitbucket/src/index.ts`) — 13 tools
- Auth: HTTP Basic Auth via `Authorization: Basic base64(username:apiToken)`
- Env vars: `BITBUCKET_USERNAME`, `BITBUCKET_API_TOKEN`, `BITBUCKET_WORKSPACE`
- `workspace` param on each tool is optional and defaults to the configured workspace
- For multiple Bitbucket accounts, register the same server binary twice under different MCP server names with different env vars
- PR diff endpoint returns raw text, not JSON — handled separately from `bitbucketFetch`

### Jira (`jira/src/index.ts`) — 26 tools
- Auth: HTTP Basic Auth via `Authorization: Basic base64(email:apiToken)`
- Env vars: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
- API version: REST v3 (`/rest/api/3/...`)
- **ADF format**: Jira v3 requires Atlassian Document Format for all text fields (comments, descriptions). Use the `adf(text)` helper to wrap plain text — never pass raw strings to body/description fields
- `transition-issue` requires a transition ID — always call `get-transitions` first to find the correct ID

## Environment Variables

Each package has `.env` and `.env.example`. The `dev` and `start` scripts load `.env` automatically via Node's `--env-file` flag. For Claude Code MCP registration, pass credentials via `--env` flags in the `claude mcp add` command.

| Package | Required env vars |
|---|---|
| trello | `TRELLO_API_KEY`, `TRELLO_TOKEN` |
| bitbucket | `BITBUCKET_USERNAME`, `BITBUCKET_API_TOKEN`, `BITBUCKET_WORKSPACE` |
| jira | `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` |

## Registering with Claude Code

```bash
claude mcp add --transport stdio <name> \
  --env KEY=value \
  -- node /absolute/path/to/mcp-dir/dist/<package>/index.js
```

Servers must be built before registering. After registering, run `/mcp` inside Claude Code to reload.
