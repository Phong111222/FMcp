# mcp-dir

A pnpm monorepo of local MCP servers for use with Claude Code.

## Setup

```bash
pnpm install
pnpm run build
```

## Register with Claude Code

### Trello

```bash
claude mcp add --transport stdio trello \
  --env TRELLO_API_KEY=your-api-key \
  --env TRELLO_TOKEN=your-token \
  -- node /absolute/path/to/mcp-dir/dist/trello/index.js
```

Get credentials:
- **API Key**: https://trello.com/app-key
- **Token**: `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=YOUR_KEY`

---

### Bitbucket

```bash
claude mcp add --transport stdio bitbucket \
  --env BITBUCKET_USERNAME=your-email@example.com \
  --env BITBUCKET_API_TOKEN=your-api-token \
  --env BITBUCKET_WORKSPACE=your-workspace-slug \
  -- node /absolute/path/to/mcp-dir/dist/bitbucket/index.js
```

Get credentials: Bitbucket → Settings → Personal Bitbucket settings → API tokens

For multiple accounts, register the server twice under different names:

```bash
claude mcp add --transport stdio bitbucket-work \
  --env BITBUCKET_USERNAME=work@example.com \
  --env BITBUCKET_API_TOKEN=token-a \
  --env BITBUCKET_WORKSPACE=workspace-a \
  -- node /absolute/path/to/mcp-dir/dist/bitbucket/index.js

claude mcp add --transport stdio bitbucket-personal \
  --env BITBUCKET_USERNAME=personal@example.com \
  --env BITBUCKET_API_TOKEN=token-b \
  --env BITBUCKET_WORKSPACE=workspace-b \
  -- node /absolute/path/to/mcp-dir/dist/bitbucket/index.js
```

---

### Jira

```bash
claude mcp add --transport stdio jira \
  --env JIRA_BASE_URL=https://yourcompany.atlassian.net \
  --env JIRA_EMAIL=your-email@example.com \
  --env JIRA_API_TOKEN=your-api-token \
  -- node /absolute/path/to/mcp-dir/dist/jira/index.js
```

Get credentials: Atlassian → Account settings → Security → API tokens

**26 tools available:**

| Group | Tools |
|---|---|
| Issues | `search-issues`, `get-issue`, `create-issue`, `update-issue`, `delete-issue` |
| Transitions | `get-transitions`, `transition-issue` |
| Comments | `get-comments`, `add-comment`, `update-comment`, `delete-comment` |
| Worklogs | `get-worklogs`, `add-worklog`, `delete-worklog` |
| Projects | `list-projects`, `get-project` |
| Users | `get-user`, `search-users`, `get-current-user` |
| Meta | `list-issue-types`, `list-priorities`, `list-labels`, `get-attachment`, `delete-attachment` |

---

## Verify

```bash
claude mcp list
```

After registering, run `/mcp` inside Claude Code to reload and confirm servers are connected.
