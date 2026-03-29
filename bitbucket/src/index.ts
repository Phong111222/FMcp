import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Auth — multi-account profiles
// ---------------------------------------------------------------------------

interface Profile {
  username: string;
  appPassword: string;
  workspace: string;
}

function loadProfile(n: string): Profile | null {
  const username  = process.env[`BITBUCKET_ACCOUNT_${n}_USERNAME`];
  const appPassword = process.env[`BITBUCKET_ACCOUNT_${n}_APP_PASSWORD`];
  const workspace = process.env[`BITBUCKET_ACCOUNT_${n}_WORKSPACE`];
  if (!username || !appPassword || !workspace) return null;
  return { username, appPassword, workspace };
}

const profile1 = loadProfile("1");
if (!profile1) {
  console.error(
    "[bitbucket-mcp] Fatal: BITBUCKET_ACCOUNT_1_USERNAME, BITBUCKET_ACCOUNT_1_APP_PASSWORD, and BITBUCKET_ACCOUNT_1_WORKSPACE must be set."
  );
  process.exit(1);
}

const profile2 = loadProfile("2");

const profiles: Record<string, Profile> = { "1": profile1 };
if (profile2) profiles["2"] = profile2;

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

const BASE = "https://api.bitbucket.org/2.0";

async function bitbucketFetch(
  path: string,
  account: string,
  options?: RequestInit
): Promise<unknown> {
  const profile = profiles[account];
  if (!profile) {
    throw new Error(`Account "${account}" is not configured. Set BITBUCKET_ACCOUNT_${account}_* env vars.`);
  }
  const creds = Buffer.from(`${profile.username}:${profile.appPassword}`).toString("base64");
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
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
  // 204 No Content
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
// Helpers
// ---------------------------------------------------------------------------

function workspaceFor(account: string, override?: string): string {
  return override ?? profiles[account]?.workspace ?? "";
}

const accountParam = z
  .enum(["1", "2"])
  .default("1")
  .describe('Which account to use: "1" (default) or "2"');

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
        text: `Bitbucket MCP server. Configured accounts: ${Object.keys(profiles).join(", ")}`,
      },
    ],
  })
);

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

server.tool(
  "list-repositories",
  "List repositories in a Bitbucket workspace",
  {
    account: accountParam,
    workspace: z
      .string()
      .optional()
      .describe("Workspace slug — defaults to the account's configured workspace"),
  },
  async ({ account, workspace }) => {
    try {
      const ws = workspaceFor(account, workspace);
      const data = await bitbucketFetch(
        `/repositories/${ws}?fields=values.slug,values.name,values.full_name,values.description,values.is_private,values.updated_on&pagelen=50`,
        account
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
    account: accountParam,
    repoSlug: z.string().describe("The repository slug"),
    workspace: z
      .string()
      .optional()
      .describe("Workspace slug — defaults to the account's configured workspace"),
  },
  async ({ account, repoSlug, workspace }) => {
    try {
      const ws = workspaceFor(account, workspace);
      const data = await bitbucketFetch(`/repositories/${ws}/${repoSlug}`, account);
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
    account: accountParam,
    repoSlug: z.string().describe("The repository slug"),
    state: z
      .enum(["OPEN", "MERGED", "DECLINED", "SUPERSEDED"])
      .default("OPEN")
      .describe("Filter PRs by state"),
    workspace: z
      .string()
      .optional()
      .describe("Workspace slug — defaults to the account's configured workspace"),
  },
  async ({ account, repoSlug, state, workspace }) => {
    try {
      const ws = workspaceFor(account, workspace);
      const data = await bitbucketFetch(
        `/repositories/${ws}/${repoSlug}/pullrequests?state=${state}&pagelen=50`,
        account
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
    account: accountParam,
    repoSlug: z.string().describe("The repository slug"),
    id: z.number().int().describe("The pull request ID"),
    workspace: z
      .string()
      .optional()
      .describe("Workspace slug — defaults to the account's configured workspace"),
  },
  async ({ account, repoSlug, id, workspace }) => {
    try {
      const ws = workspaceFor(account, workspace);
      const data = await bitbucketFetch(
        `/repositories/${ws}/${repoSlug}/pullrequests/${id}`,
        account
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
    account: accountParam,
    repoSlug: z.string().describe("The repository slug"),
    workspace: z
      .string()
      .optional()
      .describe("Workspace slug — defaults to the account's configured workspace"),
  },
  async ({ account, repoSlug, workspace }) => {
    try {
      const ws = workspaceFor(account, workspace);
      const data = await bitbucketFetch(
        `/repositories/${ws}/${repoSlug}/refs/branches?pagelen=50`,
        account
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
    account: accountParam,
    repoSlug: z.string().describe("The repository slug"),
    name: z.string().describe("The branch name"),
    workspace: z
      .string()
      .optional()
      .describe("Workspace slug — defaults to the account's configured workspace"),
  },
  async ({ account, repoSlug, name, workspace }) => {
    try {
      const ws = workspaceFor(account, workspace);
      const data = await bitbucketFetch(
        `/repositories/${ws}/${repoSlug}/refs/branches/${encodeURIComponent(name)}`,
        account
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
    account: accountParam,
    repoSlug: z.string().describe("The repository slug"),
    branch: z.string().optional().describe("Filter commits by branch name"),
    workspace: z
      .string()
      .optional()
      .describe("Workspace slug — defaults to the account's configured workspace"),
  },
  async ({ account, repoSlug, branch, workspace }) => {
    try {
      const ws = workspaceFor(account, workspace);
      const path = branch
        ? `/repositories/${ws}/${repoSlug}/commits/${encodeURIComponent(branch)}?pagelen=30`
        : `/repositories/${ws}/${repoSlug}/commits?pagelen=30`;
      const data = await bitbucketFetch(path, account);
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
    account: accountParam,
    repoSlug: z.string().describe("The repository slug"),
    workspace: z
      .string()
      .optional()
      .describe("Workspace slug — defaults to the account's configured workspace"),
  },
  async ({ account, repoSlug, workspace }) => {
    try {
      const ws = workspaceFor(account, workspace);
      const data = await bitbucketFetch(
        `/repositories/${ws}/${repoSlug}/pipelines/?sort=-created_on&pagelen=20`,
        account
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
  const accountList = Object.keys(profiles)
    .map((k) => `account ${k} (${profiles[k]!.workspace})`)
    .join(", ");
  console.error(`[bitbucket-mcp] Server started on stdio — ${accountList}`);
}

main().catch((err) => {
  console.error("[bitbucket-mcp] Fatal error:", err);
  process.exit(1);
});
