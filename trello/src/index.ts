import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Auth — fail fast if credentials are missing
// ---------------------------------------------------------------------------

const TRELLO_API_KEY = process.env["TRELLO_API_KEY"];
const TRELLO_TOKEN = process.env["TRELLO_TOKEN"];

if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
  console.error(
    "[trello-mcp] Fatal: TRELLO_API_KEY and TRELLO_TOKEN must be set in environment."
  );
  process.exit(1);
}

const apiKey: string = TRELLO_API_KEY;
const token: string = TRELLO_TOKEN;

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

const BASE = "https://api.trello.com/1";

async function trelloFetch(
  path: string,
  options?: RequestInit & { queryParams?: Record<string, string> }
): Promise<unknown> {
  const { queryParams = {}, ...fetchOptions } = options ?? {};
  const params = new URLSearchParams({ key: apiKey, token, ...queryParams });
  const url = `${BASE}${path}?${params.toString()}`;
  const res = await fetch(url, fetchOptions);
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(`Trello API ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function errorContent(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[trello-mcp] Error:", message);
  return {
    content: [{ type: "text" as const, text: message, isError: true }],
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "trello-mcp",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

server.resource(
  "trello-info",
  "trello://info",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/plain",
        text: "Trello MCP server. Env required: TRELLO_API_KEY, TRELLO_TOKEN.",
      },
    ],
  })
);

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

server.tool(
  "list-boards",
  "List all Trello boards for the authenticated member",
  {
    filter: z
      .enum(["all", "open", "closed", "starred"])
      .default("open")
      .describe("Filter boards by status"),
  },
  async ({ filter }) => {
    try {
      const data = await trelloFetch("/members/me/boards", {
        queryParams: { filter, fields: "id,name,url,closed" },
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "get-board",
  "Get details of a specific Trello board by ID",
  {
    id: z.string().describe("The Trello board ID"),
  },
  async ({ id }) => {
    try {
      const data = await trelloFetch(`/boards/${id}`, {
        queryParams: { fields: "id,name,desc,url,closed" },
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "list-lists",
  "List all lists on a Trello board",
  {
    boardId: z.string().describe("The Trello board ID"),
    filter: z
      .enum(["open", "closed", "all"])
      .default("open")
      .describe("Filter lists by status"),
  },
  async ({ boardId, filter }) => {
    try {
      const data = await trelloFetch(`/boards/${boardId}/lists`, {
        queryParams: { filter, fields: "id,name,closed,idBoard" },
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "list-cards",
  "List cards on a board or within a specific list",
  {
    id: z.string().describe("The board ID or list ID, depending on source"),
    source: z
      .enum(["board", "list"])
      .default("board")
      .describe("Whether the id refers to a board or a list"),
    filter: z
      .enum(["open", "closed", "all"])
      .default("open")
      .describe("Filter cards by status (only applies when source is board)"),
  },
  async ({ id, source, filter }) => {
    try {
      const path = source === "board" ? `/boards/${id}/cards` : `/lists/${id}/cards`;
      const queryParams: Record<string, string> = {
        fields: "id,name,desc,due,dueComplete,idList,url,closed",
      };
      if (source === "board") {
        queryParams["filter"] = filter;
      }
      const data = await trelloFetch(path, { queryParams });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "get-card",
  "Get full details of a Trello card by ID",
  {
    id: z.string().describe("The Trello card ID"),
  },
  async ({ id }) => {
    try {
      const data = await trelloFetch(`/cards/${id}`, {
        queryParams: {
          fields: "id,name,desc,due,dueComplete,closed,idList,idBoard,url,labels",
        },
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "create-card",
  "Create a new card in a Trello list",
  {
    idList: z.string().describe("The ID of the list to add the card to"),
    name: z.string().describe("The name/title of the card"),
    desc: z.string().optional().describe("Card description (markdown supported)"),
    due: z
      .string()
      .optional()
      .describe("Due date as ISO 8601, e.g. 2026-04-01T12:00:00.000Z"),
    pos: z
      .enum(["top", "bottom"])
      .optional()
      .describe("Position of the card in the list"),
  },
  async ({ idList, name, desc, due, pos }) => {
    try {
      const queryParams: Record<string, string> = { idList, name };
      if (desc !== undefined) queryParams["desc"] = desc;
      if (due !== undefined) queryParams["due"] = due;
      if (pos !== undefined) queryParams["pos"] = pos;
      const data = await trelloFetch("/cards", {
        method: "POST",
        queryParams,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "update-card",
  "Update an existing Trello card",
  {
    id: z.string().describe("The Trello card ID"),
    name: z.string().optional().describe("New card name"),
    desc: z.string().optional().describe("New card description"),
    due: z
      .string()
      .optional()
      .describe("New due date as ISO 8601, or empty string to clear"),
    dueComplete: z.boolean().optional().describe("Mark due date complete or incomplete"),
    closed: z.boolean().optional().describe("Archive (true) or unarchive (false) the card"),
    idList: z.string().optional().describe("Move the card to a different list by list ID"),
  },
  async ({ id, name, desc, due, dueComplete, closed, idList }) => {
    try {
      const queryParams: Record<string, string> = {};
      if (name !== undefined) queryParams["name"] = name;
      if (desc !== undefined) queryParams["desc"] = desc;
      if (due !== undefined) queryParams["due"] = due;
      if (dueComplete !== undefined) queryParams["dueComplete"] = String(dueComplete);
      if (closed !== undefined) queryParams["closed"] = String(closed);
      if (idList !== undefined) queryParams["idList"] = idList;
      const data = await trelloFetch(`/cards/${id}`, {
        method: "PUT",
        queryParams,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "archive-card",
  "Archive a Trello card (sets closed=true)",
  {
    id: z.string().describe("The Trello card ID to archive"),
  },
  async ({ id }) => {
    try {
      const data = await trelloFetch(`/cards/${id}`, {
        method: "PUT",
        queryParams: { closed: "true" },
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (err) {
      return errorContent(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Board management
// ---------------------------------------------------------------------------

server.tool(
  "update-board",
  "Update properties of a Trello board",
  {
    id: z.string().describe("The Trello board ID"),
    name: z.string().optional().describe("New board name"),
    desc: z.string().optional().describe("New board description"),
    closed: z.boolean().optional().describe("Archive (true) or unarchive (false) the board"),
  },
  async ({ id, name, desc, closed }) => {
    try {
      const queryParams: Record<string, string> = {};
      if (name !== undefined) queryParams["name"] = name;
      if (desc !== undefined) queryParams["desc"] = desc;
      if (closed !== undefined) queryParams["closed"] = String(closed);
      const data = await trelloFetch(`/boards/${id}`, { method: "PUT", queryParams });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "get-board-members",
  "Get all members of a Trello board",
  {
    id: z.string().describe("The Trello board ID"),
  },
  async ({ id }) => {
    try {
      const data = await trelloFetch(`/boards/${id}/members`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "get-board-labels",
  "Get all labels defined on a Trello board",
  {
    id: z.string().describe("The Trello board ID"),
  },
  async ({ id }) => {
    try {
      const data = await trelloFetch(`/boards/${id}/labels`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "get-board-actions",
  "Get activity feed (actions) for a Trello board",
  {
    id: z.string().describe("The Trello board ID"),
    filter: z
      .string()
      .optional()
      .describe(
        "Comma-separated action types to filter, e.g. commentCard,updateCard. Omit for all types."
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(50)
      .describe("Number of actions to return (1–1000)"),
  },
  async ({ id, filter, limit }) => {
    try {
      const queryParams: Record<string, string> = { limit: String(limit) };
      if (filter !== undefined) queryParams["filter"] = filter;
      const data = await trelloFetch(`/boards/${id}/actions`, { queryParams });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

// ---------------------------------------------------------------------------
// List management
// ---------------------------------------------------------------------------

server.tool(
  "create-list",
  "Create a new list on a Trello board",
  {
    idBoard: z.string().describe("The board ID to add the list to"),
    name: z.string().describe("The name of the list"),
    pos: z
      .string()
      .optional()
      .describe("Position: 'top', 'bottom', or a positive number"),
  },
  async ({ idBoard, name, pos }) => {
    try {
      const queryParams: Record<string, string> = { idBoard, name };
      if (pos !== undefined) queryParams["pos"] = pos;
      const data = await trelloFetch("/lists", { method: "POST", queryParams });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "update-list",
  "Update properties of a Trello list",
  {
    id: z.string().describe("The Trello list ID"),
    name: z.string().optional().describe("New list name"),
    closed: z.boolean().optional().describe("Archive (true) or unarchive (false) the list"),
    pos: z.string().optional().describe("New position: 'top', 'bottom', or a positive number"),
    idBoard: z.string().optional().describe("Move the list to a different board by board ID"),
  },
  async ({ id, name, closed, pos, idBoard }) => {
    try {
      const queryParams: Record<string, string> = {};
      if (name !== undefined) queryParams["name"] = name;
      if (closed !== undefined) queryParams["closed"] = String(closed);
      if (pos !== undefined) queryParams["pos"] = pos;
      if (idBoard !== undefined) queryParams["idBoard"] = idBoard;
      const data = await trelloFetch(`/lists/${id}`, { method: "PUT", queryParams });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "archive-list",
  "Archive a Trello list (sets closed=true)",
  {
    id: z.string().describe("The Trello list ID to archive"),
  },
  async ({ id }) => {
    try {
      const data = await trelloFetch(`/lists/${id}`, {
        method: "PUT",
        queryParams: { closed: "true" },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "move-all-cards",
  "Move all cards from one Trello list to another",
  {
    id: z.string().describe("The source list ID"),
    idBoard: z.string().describe("The destination board ID"),
    idList: z.string().describe("The destination list ID"),
  },
  async ({ id, idBoard, idList }) => {
    try {
      const data = await trelloFetch(`/lists/${id}/moveAllCards`, {
        method: "POST",
        queryParams: { idBoard, idList },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Card extras
// ---------------------------------------------------------------------------

server.tool(
  "delete-card",
  "Permanently delete a Trello card",
  {
    id: z.string().describe("The Trello card ID to delete"),
  },
  async ({ id }) => {
    try {
      await trelloFetch(`/cards/${id}`, { method: "DELETE" });
      return { content: [{ type: "text" as const, text: `Card ${id} deleted.` }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "add-comment",
  "Add a comment to a Trello card",
  {
    id: z.string().describe("The Trello card ID"),
    text: z.string().describe("The comment text (markdown supported)"),
  },
  async ({ id, text }) => {
    try {
      const data = await trelloFetch(`/cards/${id}/actions/comments`, {
        method: "POST",
        queryParams: { text },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "get-card-comments",
  "Get all comments on a Trello card",
  {
    id: z.string().describe("The Trello card ID"),
  },
  async ({ id }) => {
    try {
      const data = await trelloFetch(`/cards/${id}/actions`, {
        queryParams: { filter: "commentCard" },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "get-card-checklists",
  "Get all checklists on a Trello card",
  {
    id: z.string().describe("The Trello card ID"),
  },
  async ({ id }) => {
    try {
      const data = await trelloFetch(`/cards/${id}/checklists`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Checklists
// ---------------------------------------------------------------------------

server.tool(
  "create-checklist",
  "Create a new checklist on a Trello card",
  {
    idCard: z.string().describe("The card ID to add the checklist to"),
    name: z.string().describe("The name of the checklist"),
    pos: z
      .string()
      .optional()
      .describe("Position: 'top', 'bottom', or a positive number"),
  },
  async ({ idCard, name, pos }) => {
    try {
      const queryParams: Record<string, string> = { idCard, name };
      if (pos !== undefined) queryParams["pos"] = pos;
      const data = await trelloFetch("/checklists", { method: "POST", queryParams });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "add-checklist-item",
  "Add an item to a Trello checklist",
  {
    id: z.string().describe("The checklist ID"),
    name: z.string().describe("The text of the checklist item"),
    checked: z.boolean().optional().describe("Whether the item starts as checked"),
    pos: z
      .string()
      .optional()
      .describe("Position: 'top', 'bottom', or a positive number"),
  },
  async ({ id, name, checked, pos }) => {
    try {
      const queryParams: Record<string, string> = { name };
      if (checked !== undefined) queryParams["checked"] = String(checked);
      if (pos !== undefined) queryParams["pos"] = pos;
      const data = await trelloFetch(`/checklists/${id}/checkItems`, {
        method: "POST",
        queryParams,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "update-checklist-item",
  "Update a checklist item on a Trello card (e.g. mark complete/incomplete)",
  {
    idCard: z.string().describe("The card ID the checklist belongs to"),
    idCheckItem: z.string().describe("The checklist item ID"),
    name: z.string().optional().describe("New text for the item"),
    state: z
      .enum(["complete", "incomplete"])
      .optional()
      .describe("Mark the item complete or incomplete"),
    pos: z
      .string()
      .optional()
      .describe("New position: 'top', 'bottom', or a positive number"),
  },
  async ({ idCard, idCheckItem, name, state, pos }) => {
    try {
      const queryParams: Record<string, string> = {};
      if (name !== undefined) queryParams["name"] = name;
      if (state !== undefined) queryParams["state"] = state;
      if (pos !== undefined) queryParams["pos"] = pos;
      const data = await trelloFetch(`/cards/${idCard}/checkItem/${idCheckItem}`, {
        method: "PUT",
        queryParams,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "delete-checklist",
  "Delete a checklist from a Trello card",
  {
    id: z.string().describe("The checklist ID to delete"),
  },
  async ({ id }) => {
    try {
      await trelloFetch(`/checklists/${id}`, { method: "DELETE" });
      return { content: [{ type: "text" as const, text: `Checklist ${id} deleted.` }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[trello-mcp] Server started on stdio");
}

main().catch((err) => {
  console.error("[trello-mcp] Fatal error:", err);
  process.exit(1);
});
