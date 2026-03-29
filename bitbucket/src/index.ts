import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Auth — fail fast if credentials are missing
// ---------------------------------------------------------------------------

const BITBUCKET_USERNAME  = process.env["BITBUCKET_USERNAME"];
const BITBUCKET_API_TOKEN = process.env["BITBUCKET_API_TOKEN"];
const BITBUCKET_WORKSPACE = process.env["BITBUCKET_WORKSPACE"];

if (!BITBUCKET_USERNAME || !BITBUCKET_API_TOKEN || !BITBUCKET_WORKSPACE) {
  console.error(
    "[bitbucket-mcp] Fatal: BITBUCKET_USERNAME, BITBUCKET_API_TOKEN, and BITBUCKET_WORKSPACE must be set."
  );
  process.exit(1);
}

const username: string  = BITBUCKET_USERNAME;
const apiToken: string  = BITBUCKET_API_TOKEN;
const workspace: string = BITBUCKET_WORKSPACE;

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

const BASE = "https://api.bitbucket.org/2.0";

async function bitbucketFetch(path: string, options?: RequestInit): Promise<unknown> {
  const creds = Buffer.from(`${username}:${apiToken}`).toString("base64");
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(`Bitbucket API ${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function errorContent(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[bitbucket-mcp] Error:", message);
  return {
    content: [{ type: "text" as const, text: message, isError: true }],
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "bitbucket-mcp",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

server.resource(
  "bitbucket-info",
  "bitbucket://info",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/plain",
        text: `Bitbucket MCP server. Workspace: ${workspace}`,
      },
    ],
  })
);

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

server.tool(
  "list-repositories",
  "List repositories in the configured Bitbucket workspace",
  {
    workspace: z
      .string()
      .optional()
      .describe("Override the default workspace slug"),
  },
  async ({ workspace: wsOverride }) => {
    try {
      const ws = wsOverride ?? workspace;
      const data = await bitbucketFetch(
        `/repositories/${ws}?fields=values.slug,values.name,values.full_name,values.description,values.is_private,values.updated_on&pagelen=50`
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "get-repository",
  "Get details of a specific Bitbucket repository",
  {
    repoSlug: z.string().describe("The repository slug"),
    workspace: z.string().optional().describe("Override the default workspace slug"),
  },
  async ({ repoSlug, workspace: wsOverride }) => {
    try {
      const ws = wsOverride ?? workspace;
      const data = await bitbucketFetch(`/repositories/${ws}/${repoSlug}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "list-pull-requests",
  "List pull requests in a Bitbucket repository",
  {
    repoSlug: z.string().describe("The repository slug"),
    state: z
      .enum(["OPEN", "MERGED", "DECLINED", "SUPERSEDED"])
      .default("OPEN")
      .describe("Filter PRs by state"),
    workspace: z.string().optional().describe("Override the default workspace slug"),
  },
  async ({ repoSlug, state, workspace: wsOverride }) => {
    try {
      const ws = wsOverride ?? workspace;
      const data = await bitbucketFetch(
        `/repositories/${ws}/${repoSlug}/pullrequests?state=${state}&pagelen=50`
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "get-pull-request",
  "Get details of a specific Bitbucket pull request",
  {
    repoSlug: z.string().describe("The repository slug"),
    id: z.number().int().describe("The pull request ID"),
    workspace: z.string().optional().describe("Override the default workspace slug"),
  },
  async ({ repoSlug, id, workspace: wsOverride }) => {
    try {
      const ws = wsOverride ?? workspace;
      const data = await bitbucketFetch(`/repositories/${ws}/${repoSlug}/pullrequests/${id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "get-pull-request-comments",
  "Get all comments on a Bitbucket pull request",
  {
    repoSlug: z.string().describe("The repository slug"),
    id: z.number().int().describe("The pull request ID"),
    workspace: z.string().optional().describe("Override the default workspace slug"),
  },
  async ({ repoSlug, id, workspace: wsOverride }) => {
    try {
      const ws = wsOverride ?? workspace;
      const data = await bitbucketFetch(
        `/repositories/${ws}/${repoSlug}/pullrequests/${id}/comments?pagelen=50`
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "get-pull-request-diff",
  "Get the diff of a Bitbucket pull request",
  {
    repoSlug: z.string().describe("The repository slug"),
    id: z.number().int().describe("The pull request ID"),
    workspace: z.string().optional().describe("Override the default workspace slug"),
  },
  async ({ repoSlug, id, workspace: wsOverride }) => {
    try {
      const ws = wsOverride ?? workspace;
      const creds = Buffer.from(`${username}:${apiToken}`).toString("base64");
      const res = await fetch(`${BASE}/repositories/${ws}/${repoSlug}/pullrequests/${id}/diff`, {
        headers: { Authorization: `Basic ${creds}` },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "(no body)");
        throw new Error(`Bitbucket API ${res.status} ${res.statusText}: ${body}`);
      }
      const text = await res.text();
      return { content: [{ type: "text" as const, text }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "add-pull-request-comment",
  "Add a comment to a Bitbucket pull request",
  {
    repoSlug: z.string().describe("The repository slug"),
    id: z.number().int().describe("The pull request ID"),
    text: z.string().describe("The comment text"),
    workspace: z.string().optional().describe("Override the default workspace slug"),
  },
  async ({ repoSlug, id, text, workspace: wsOverride }) => {
    try {
      const ws = wsOverride ?? workspace;
      const data = await bitbucketFetch(
        `/repositories/${ws}/${repoSlug}/pullrequests/${id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ content: { raw: text } }),
        }
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "approve-pull-request",
  "Approve a Bitbucket pull request",
  {
    repoSlug: z.string().describe("The repository slug"),
    id: z.number().int().describe("The pull request ID"),
    workspace: z.string().optional().describe("Override the default workspace slug"),
  },
  async ({ repoSlug, id, workspace: wsOverride }) => {
    try {
      const ws = wsOverride ?? workspace;
      const data = await bitbucketFetch(
        `/repositories/${ws}/${repoSlug}/pullrequests/${id}/approve`,
        { method: "POST" }
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "merge-pull-request",
  "Merge a Bitbucket pull request",
  {
    repoSlug: z.string().describe("The repository slug"),
    id: z.number().int().describe("The pull request ID"),
    message: z.string().optional().describe("Custom merge commit message"),
    closeSourceBranch: z.boolean().optional().describe("Delete source branch after merge"),
    mergeStrategy: z
      .enum(["merge_commit", "squash", "fast_forward"])
      .optional()
      .describe("Merge strategy (default: merge_commit)"),
    workspace: z.string().optional().describe("Override the default workspace slug"),
  },
  async ({ repoSlug, id, message, closeSourceBranch, mergeStrategy, workspace: wsOverride }) => {
    try {
      const ws = wsOverride ?? workspace;
      const body: Record<string, unknown> = {};
      if (message !== undefined) body["message"] = message;
      if (closeSourceBranch !== undefined) body["close_source_branch"] = closeSourceBranch;
      if (mergeStrategy !== undefined) body["merge_strategy"] = mergeStrategy;
      const data = await bitbucketFetch(
        `/repositories/${ws}/${repoSlug}/pullrequests/${id}/merge`,
        { method: "POST", body: JSON.stringify(body) }
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "list-branches",
  "List branches in a Bitbucket repository",
  {
    repoSlug: z.string().describe("The repository slug"),
    workspace: z.string().optional().describe("Override the default workspace slug"),
  },
  async ({ repoSlug, workspace: wsOverride }) => {
    try {
      const ws = wsOverride ?? workspace;
      const data = await bitbucketFetch(
        `/repositories/${ws}/${repoSlug}/refs/branches?pagelen=50`
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "get-branch",
  "Get details of a specific branch in a Bitbucket repository",
  {
    repoSlug: z.string().describe("The repository slug"),
    name: z.string().describe("The branch name"),
    workspace: z.string().optional().describe("Override the default workspace slug"),
  },
  async ({ repoSlug, name, workspace: wsOverride }) => {
    try {
      const ws = wsOverride ?? workspace;
      const data = await bitbucketFetch(
        `/repositories/${ws}/${repoSlug}/refs/branches/${encodeURIComponent(name)}`
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "list-commits",
  "List commits in a Bitbucket repository",
  {
    repoSlug: z.string().describe("The repository slug"),
    branch: z.string().optional().describe("Filter commits by branch name"),
    workspace: z.string().optional().describe("Override the default workspace slug"),
  },
  async ({ repoSlug, branch, workspace: wsOverride }) => {
    try {
      const ws = wsOverride ?? workspace;
      const path = branch
        ? `/repositories/${ws}/${repoSlug}/commits/${encodeURIComponent(branch)}?pagelen=30`
        : `/repositories/${ws}/${repoSlug}/commits?pagelen=30`;
      const data = await bitbucketFetch(path);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorContent(err);
    }
  }
);

server.tool(
  "list-pipelines",
  "List recent pipelines in a Bitbucket repository",
  {
    repoSlug: z.string().describe("The repository slug"),
    workspace: z.string().optional().describe("Override the default workspace slug"),
  },
  async ({ repoSlug, workspace: wsOverride }) => {
    try {
      const ws = wsOverride ?? workspace;
      const data = await bitbucketFetch(
        `/repositories/${ws}/${repoSlug}/pipelines/?sort=-created_on&pagelen=20`
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
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
  console.error(`[bitbucket-mcp] Server started on stdio — workspace: ${workspace}`);
}

main().catch((err) => {
  console.error("[bitbucket-mcp] Fatal error:", err);
  process.exit(1);
});
