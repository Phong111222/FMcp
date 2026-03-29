# bitbucket-mcp

A local MCP server for Bitbucket, built with TypeScript. Exposes 8 tools covering repositories, pull requests, branches, commits, and pipelines.

## Prerequisites

- Node.js >= 18
- pnpm >= 10
- A Bitbucket account with an API token

## Setup

### 1. Get Bitbucket credentials

- **Username**: Your Bitbucket account email or username
- **API Token**: Bitbucket → Settings → Personal Bitbucket settings → API tokens → Create token
- **Workspace**: The workspace slug from your Bitbucket workspace URL (e.g. `https://bitbucket.org/{workspace}/`)

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

```env
BITBUCKET_USERNAME=your-email@example.com
BITBUCKET_API_TOKEN=your-api-token
BITBUCKET_WORKSPACE=your-workspace-slug
```

### 3. Install and build

```bash
# From the monorepo root
pnpm install
pnpm --filter bitbucket-mcp run build
```

## Add to Claude Code

Run the following command once to register the server:

```bash
claude mcp add --transport stdio bitbucket \
  --env BITBUCKET_USERNAME=your-email@example.com \
  --env BITBUCKET_API_TOKEN=your-api-token \
  --env BITBUCKET_WORKSPACE=your-workspace-slug \
  -- node /absolute/path/to/mcp-dir/bitbucket/dist/index.js
```

Verify the server is connected:

```bash
claude mcp get bitbucket
```

You should see `Status: ✓ Connected`.

> After adding, run `/mcp` inside Claude Code to reload and confirm all tools appear.

### Managing multiple accounts

If you need to connect multiple Bitbucket accounts, register the server twice with different names:

```bash
claude mcp add --transport stdio bitbucket-work \
  --env BITBUCKET_USERNAME=work@example.com \
  --env BITBUCKET_API_TOKEN=token-a \
  --env BITBUCKET_WORKSPACE=workspace-a \
  -- node /absolute/path/to/mcp-dir/bitbucket/dist/index.js

claude mcp add --transport stdio bitbucket-personal \
  --env BITBUCKET_USERNAME=personal@example.com \
  --env BITBUCKET_API_TOKEN=token-b \
  --env BITBUCKET_WORKSPACE=workspace-b \
  -- node /absolute/path/to/mcp-dir/bitbucket/dist/index.js
```

## Development

```bash
# Watch mode — no build step needed
pnpm --filter bitbucket-mcp run dev

# Build
pnpm --filter bitbucket-mcp run build

# Type check
pnpm --filter bitbucket-mcp run typecheck
```

## Available Tools

| Tool | Description |
|---|---|
| `list-repositories` | List all repositories in the workspace |
| `get-repository` | Get details of a specific repository |
| `list-pull-requests` | List PRs (filter: OPEN/MERGED/DECLINED/SUPERSEDED) |
| `get-pull-request` | Get details of a specific PR |
| `list-branches` | List all branches in a repository |
| `get-branch` | Get details of a specific branch |
| `list-commits` | List commits, optionally filtered by branch |
| `list-pipelines` | List recent pipelines sorted by creation date |

All tools accept an optional `workspace` parameter to override the default configured workspace.
