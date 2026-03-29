import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

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
        text: "Bitbucket MCP server is running. Register your tools below.",
      },
    ],
  })
);

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

server.tool(
  "list-repositories",
  "List Bitbucket repositories for a workspace",
  {
    workspace: z.string().describe("The Bitbucket workspace slug"),
  },
  async ({ workspace }) => {
    // TODO: implement Bitbucket REST API call
    // GET https://api.bitbucket.org/2.0/repositories/{workspace}
    return {
      content: [
        {
          type: "text" as const,
          text: `[stub] Would list repositories in workspace: ${workspace}`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Do NOT write to stdout after connect — it corrupts the MCP stream.
  console.error("[bitbucket-mcp] Server started on stdio");
}

main().catch((err) => {
  console.error("[bitbucket-mcp] Fatal error:", err);
  process.exit(1);
});
