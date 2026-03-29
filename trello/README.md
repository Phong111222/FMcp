# trello-mcp

A local MCP server for Trello, built with TypeScript. Exposes 24 tools covering boards, lists, cards, checklists, labels, and comments.

## Prerequisites

- Node.js >= 18
- pnpm >= 10
- A Trello account with an API key and token

## Setup

### 1. Get Trello credentials

- **API Key**: https://trello.com/app-key
- **Token**: Visit the following URL (replace `YOUR_KEY`):
  ```
  https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=YOUR_KEY
  ```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

```env
TRELLO_API_KEY=your-api-key
TRELLO_TOKEN=your-token
```

### 3. Install and build

```bash
# From the monorepo root
pnpm install
pnpm --filter trello-mcp run build
```

## Add to Claude Code

Run the following command once to register the server:

```bash
claude mcp add --transport stdio trello \
  --env TRELLO_API_KEY=your-api-key \
  --env TRELLO_TOKEN=your-token \
  -- node /absolute/path/to/mcp-dir/trello/dist/index.js
```

Verify the server is connected:

```bash
claude mcp get trello
```

You should see `Status: ✓ Connected`.

> After adding, run `/mcp` inside Claude Code to reload and confirm all tools appear.

## Development

```bash
# Watch mode — no build step needed
pnpm --filter trello-mcp run dev

# Build
pnpm --filter trello-mcp run build

# Type check
pnpm --filter trello-mcp run typecheck
```

## Available Tools

### Boards
| Tool | Description |
|---|---|
| `list-boards` | List all boards (filter: open/closed/starred/all) |
| `get-board` | Get board details by ID |
| `update-board` | Update board name, description, or archive it |
| `get-board-members` | List members of a board |
| `get-board-labels` | List label definitions on a board |
| `get-board-actions` | Get the activity feed for a board |

### Lists
| Tool | Description |
|---|---|
| `list-lists` | List all lists on a board |
| `create-list` | Create a new list on a board |
| `update-list` | Update list name, position, or move to another board |
| `archive-list` | Archive a list |
| `move-all-cards` | Move all cards from one list to another |

### Cards
| Tool | Description |
|---|---|
| `list-cards` | List cards on a board or within a list |
| `get-card` | Get full card details |
| `create-card` | Create a card in a list |
| `update-card` | Update card name, description, due date, list, etc. |
| `archive-card` | Archive a card |
| `delete-card` | Permanently delete a card |
| `add-comment` | Add a comment to a card |
| `get-card-comments` | Get all comments on a card |
| `get-card-checklists` | Get all checklists on a card |

### Checklists
| Tool | Description |
|---|---|
| `create-checklist` | Create a checklist on a card |
| `add-checklist-item` | Add an item to a checklist |
| `update-checklist-item` | Mark an item complete/incomplete, rename, or reorder |
| `delete-checklist` | Delete a checklist |
