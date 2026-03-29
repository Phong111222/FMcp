import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Auth — fail fast if credentials are missing
// ---------------------------------------------------------------------------

const JIRA_BASE_URL  = process.env["JIRA_BASE_URL"];
const JIRA_EMAIL     = process.env["JIRA_EMAIL"];
const JIRA_API_TOKEN = process.env["JIRA_API_TOKEN"];

if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
  console.error(
    "[jira-mcp] Fatal: JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN must be set."
  );
  process.exit(1);
}

const baseUrl: string = JIRA_BASE_URL.replace(/\/$/, "");
const creds = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function jiraFetch(
  path: string,
  options?: RequestInit
): Promise<unknown> {
  const url = `${baseUrl}/rest/api/3${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(`Jira API ${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// ADF helper — wrap plain text in Atlassian Document Format
// ---------------------------------------------------------------------------

function adf(text: string) {
  return {
    version: 1,
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function errorContent(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[jira-mcp] Error:", message);
  return {
    content: [{ type: "text" as const, text: message, isError: true }],
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "jira-mcp",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

server.resource(
  "jira-info",
  "jira://info",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/plain",
        text: `Jira MCP server. Base URL: ${baseUrl}`,
      },
    ],
  })
);

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

server.tool(
  "search-issues",
  "Search Jira issues using JQL",
  {
    jql: z.string().describe("A valid JQL query string"),
    maxResults: z.number().int().min(1).max(100).default(20).describe("Max results to return"),
    startAt: z.number().int().default(0).describe("Index of the first result"),
    fields: z
      .string()
      .optional()
      .describe("Comma-separated fields to return, e.g. summary,status,assignee"),
  },
  async ({ jql, maxResults, startAt, fields }) => {
    try {
      const body: Record<string, unknown> = { jql, maxResults, startAt };
      if (fields) body["fields"] = fields.split(",").map((f) => f.trim());
      const data = await jiraFetch("/search/jql", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "get-issue",
  "Get details of a specific Jira issue",
  {
    issueIdOrKey: z.string().describe("The issue ID or key, e.g. PROJ-123"),
    fields: z.string().optional().describe("Comma-separated fields to return"),
    expand: z.string().optional().describe("Comma-separated expansions, e.g. changelog,renderedFields"),
  },
  async ({ issueIdOrKey, fields, expand }) => {
    try {
      const params = new URLSearchParams();
      if (fields) params.set("fields", fields);
      if (expand) params.set("expand", expand);
      const query = params.toString() ? `?${params.toString()}` : "";
      const data = await jiraFetch(`/issue/${issueIdOrKey}${query}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "create-issue",
  "Create a new Jira issue",
  {
    projectKey: z.string().describe("The project key, e.g. PROJ"),
    summary: z.string().describe("Issue summary/title"),
    issueType: z.string().default("Task").describe("Issue type name, e.g. Task, Bug, Story"),
    description: z.string().optional().describe("Issue description (plain text)"),
    assigneeAccountId: z.string().optional().describe("Assignee account ID"),
    priority: z.string().optional().describe("Priority name, e.g. High, Medium, Low"),
    labels: z.array(z.string()).optional().describe("List of label strings"),
  },
  async ({ projectKey, summary, issueType, description, assigneeAccountId, priority, labels }) => {
    try {
      const fields: Record<string, unknown> = {
        project: { key: projectKey },
        summary,
        issuetype: { name: issueType },
      };
      if (description) fields["description"] = adf(description);
      if (assigneeAccountId) fields["assignee"] = { accountId: assigneeAccountId };
      if (priority) fields["priority"] = { name: priority };
      if (labels) fields["labels"] = labels;
      const data = await jiraFetch("/issue", {
        method: "POST",
        body: JSON.stringify({ fields }),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "update-issue",
  "Update fields of an existing Jira issue",
  {
    issueIdOrKey: z.string().describe("The issue ID or key"),
    summary: z.string().optional().describe("New summary"),
    description: z.string().optional().describe("New description (plain text)"),
    assigneeAccountId: z.string().optional().describe("New assignee account ID"),
    priority: z.string().optional().describe("New priority name"),
    labels: z.array(z.string()).optional().describe("New list of labels (replaces existing)"),
  },
  async ({ issueIdOrKey, summary, description, assigneeAccountId, priority, labels }) => {
    try {
      const fields: Record<string, unknown> = {};
      if (summary) fields["summary"] = summary;
      if (description) fields["description"] = adf(description);
      if (assigneeAccountId) fields["assignee"] = { accountId: assigneeAccountId };
      if (priority) fields["priority"] = { name: priority };
      if (labels) fields["labels"] = labels;
      await jiraFetch(`/issue/${issueIdOrKey}`, {
        method: "PUT",
        body: JSON.stringify({ fields }),
      });
      return { content: [{ type: "text" as const, text: `Issue ${issueIdOrKey} updated.` }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "delete-issue",
  "Delete a Jira issue",
  {
    issueIdOrKey: z.string().describe("The issue ID or key"),
    deleteSubtasks: z.boolean().default(false).describe("Also delete subtasks"),
  },
  async ({ issueIdOrKey, deleteSubtasks }) => {
    try {
      await jiraFetch(`/issue/${issueIdOrKey}?deleteSubtasks=${deleteSubtasks}`, {
        method: "DELETE",
      });
      return { content: [{ type: "text" as const, text: `Issue ${issueIdOrKey} deleted.` }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

server.tool(
  "get-transitions",
  "Get available workflow transitions for a Jira issue",
  {
    issueIdOrKey: z.string().describe("The issue ID or key"),
  },
  async ({ issueIdOrKey }) => {
    try {
      const data = await jiraFetch(`/issue/${issueIdOrKey}/transitions`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "transition-issue",
  "Transition a Jira issue to a new status",
  {
    issueIdOrKey: z.string().describe("The issue ID or key"),
    transitionId: z.string().describe("The transition ID (get from get-transitions)"),
    comment: z.string().optional().describe("Optional comment to add with the transition"),
  },
  async ({ issueIdOrKey, transitionId, comment }) => {
    try {
      const body: Record<string, unknown> = { transition: { id: transitionId } };
      if (comment) {
        body["update"] = {
          comment: [{ add: { body: adf(comment) } }],
        };
      }
      await jiraFetch(`/issue/${issueIdOrKey}/transitions`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return { content: [{ type: "text" as const, text: `Issue ${issueIdOrKey} transitioned.` }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

server.tool(
  "get-comments",
  "Get all comments on a Jira issue",
  {
    issueIdOrKey: z.string().describe("The issue ID or key"),
    maxResults: z.number().int().default(50).describe("Max comments to return"),
    startAt: z.number().int().default(0).describe("Index of the first comment"),
  },
  async ({ issueIdOrKey, maxResults, startAt }) => {
    try {
      const data = await jiraFetch(
        `/issue/${issueIdOrKey}/comment?maxResults=${maxResults}&startAt=${startAt}`
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "add-comment",
  "Add a comment to a Jira issue",
  {
    issueIdOrKey: z.string().describe("The issue ID or key"),
    text: z.string().describe("The comment text"),
  },
  async ({ issueIdOrKey, text }) => {
    try {
      const data = await jiraFetch(`/issue/${issueIdOrKey}/comment`, {
        method: "POST",
        body: JSON.stringify({ body: adf(text) }),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "update-comment",
  "Update a comment on a Jira issue",
  {
    issueIdOrKey: z.string().describe("The issue ID or key"),
    commentId: z.string().describe("The comment ID"),
    text: z.string().describe("New comment text"),
  },
  async ({ issueIdOrKey, commentId, text }) => {
    try {
      const data = await jiraFetch(`/issue/${issueIdOrKey}/comment/${commentId}`, {
        method: "PUT",
        body: JSON.stringify({ body: adf(text) }),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "delete-comment",
  "Delete a comment on a Jira issue",
  {
    issueIdOrKey: z.string().describe("The issue ID or key"),
    commentId: z.string().describe("The comment ID"),
  },
  async ({ issueIdOrKey, commentId }) => {
    try {
      await jiraFetch(`/issue/${issueIdOrKey}/comment/${commentId}`, { method: "DELETE" });
      return { content: [{ type: "text" as const, text: `Comment ${commentId} deleted.` }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Worklogs
// ---------------------------------------------------------------------------

server.tool(
  "get-worklogs",
  "Get all worklogs for a Jira issue",
  {
    issueIdOrKey: z.string().describe("The issue ID or key"),
    maxResults: z.number().int().default(50).describe("Max worklogs to return"),
    startAt: z.number().int().default(0).describe("Index of the first worklog"),
  },
  async ({ issueIdOrKey, maxResults, startAt }) => {
    try {
      const data = await jiraFetch(
        `/issue/${issueIdOrKey}/worklog?maxResults=${maxResults}&startAt=${startAt}`
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "add-worklog",
  "Log work time on a Jira issue",
  {
    issueIdOrKey: z.string().describe("The issue ID or key"),
    timeSpent: z.string().describe("Time spent, e.g. 2h 30m, 1d"),
    started: z
      .string()
      .optional()
      .describe("Start time in ISO 8601, e.g. 2026-03-29T09:00:00.000+0000. Defaults to now."),
    comment: z.string().optional().describe("Worklog comment"),
  },
  async ({ issueIdOrKey, timeSpent, started, comment }) => {
    try {
      const body: Record<string, unknown> = {
        timeSpent,
        started: started ?? new Date().toISOString().replace("Z", "+0000"),
      };
      if (comment) body["comment"] = adf(comment);
      const data = await jiraFetch(`/issue/${issueIdOrKey}/worklog`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "delete-worklog",
  "Delete a worklog entry from a Jira issue",
  {
    issueIdOrKey: z.string().describe("The issue ID or key"),
    worklogId: z.string().describe("The worklog ID"),
  },
  async ({ issueIdOrKey, worklogId }) => {
    try {
      await jiraFetch(`/issue/${issueIdOrKey}/worklog/${worklogId}`, { method: "DELETE" });
      return { content: [{ type: "text" as const, text: `Worklog ${worklogId} deleted.` }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

server.tool(
  "list-projects",
  "List all Jira projects",
  {
    maxResults: z.number().int().default(50).describe("Max projects to return"),
    startAt: z.number().int().default(0).describe("Index of the first project"),
  },
  async ({ maxResults, startAt }) => {
    try {
      const data = await jiraFetch(
        `/project/search?maxResults=${maxResults}&startAt=${startAt}`
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "get-project",
  "Get details of a specific Jira project",
  {
    projectIdOrKey: z.string().describe("The project ID or key"),
  },
  async ({ projectIdOrKey }) => {
    try {
      const data = await jiraFetch(`/project/${projectIdOrKey}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Issue types, priorities, labels
// ---------------------------------------------------------------------------

server.tool(
  "list-issue-types",
  "List all Jira issue types",
  {},
  async () => {
    try {
      const data = await jiraFetch("/issuetype");
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "list-priorities",
  "List all Jira priorities",
  {},
  async () => {
    try {
      const data = await jiraFetch("/priority");
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "list-labels",
  "List all Jira labels",
  {
    maxResults: z.number().int().default(50).describe("Max labels to return"),
    startAt: z.number().int().default(0).describe("Index of the first label"),
  },
  async ({ maxResults, startAt }) => {
    try {
      const data = await jiraFetch(`/label?maxResults=${maxResults}&startAt=${startAt}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

server.tool(
  "get-user",
  "Get a Jira user by account ID",
  {
    accountId: z.string().describe("The user account ID"),
  },
  async ({ accountId }) => {
    try {
      const data = await jiraFetch(`/user?accountId=${encodeURIComponent(accountId)}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "search-users",
  "Search for Jira users by query string",
  {
    query: z.string().describe("Search query (name, email, or username)"),
    maxResults: z.number().int().default(20).describe("Max users to return"),
  },
  async ({ query, maxResults }) => {
    try {
      const data = await jiraFetch(
        `/user/search?query=${encodeURIComponent(query)}&maxResults=${maxResults}`
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "get-current-user",
  "Get the currently authenticated Jira user",
  {},
  async () => {
    try {
      const data = await jiraFetch("/myself");
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

server.tool(
  "get-attachment",
  "Get metadata for a Jira attachment",
  {
    attachmentId: z.string().describe("The attachment ID"),
  },
  async ({ attachmentId }) => {
    try {
      const data = await jiraFetch(`/attachment/${attachmentId}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "delete-attachment",
  "Delete a Jira attachment",
  {
    attachmentId: z.string().describe("The attachment ID"),
  },
  async ({ attachmentId }) => {
    try {
      await jiraFetch(`/attachment/${attachmentId}`, { method: "DELETE" });
      return { content: [{ type: "text" as const, text: `Attachment ${attachmentId} deleted.` }] };
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
  console.error(`[jira-mcp] Server started on stdio — ${baseUrl}`);
}

main().catch((err) => {
  console.error("[jira-mcp] Fatal error:", err);
  process.exit(1);
});
