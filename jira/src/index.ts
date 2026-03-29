import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

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
        text: "Jira MCP server is running. Register your tools below.",
      },
    ],
  })
);

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

server.tool(
  "search-issues",
  "Search Jira issues using JQL",
  {
    jql: z.string().describe("A valid JQL query string"),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .describe("Maximum number of results to return"),
  },
  async ({ jql, maxResults }) => {
    // TODO: implement Jira REST API call
    // POST https://{domain}.atlassian.net/rest/api/3/issue/search
    return {
      content: [
        {
          type: "text" as const,
          text: `[stub] Would search Jira with JQL: "${jql}" (max ${maxResults} results)`,
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
  console.error("[jira-mcp] Server started on stdio");
}

main().catch((err) => {
  console.error("[jira-mcp] Fatal error:", err);
  process.exit(1);
});
