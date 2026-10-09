import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

function createServer() {
    const server = new McpServer({ name: "my-mcp-server", version: "1.0.0" });

    server.registerTool(
        "add",
        {
            title: "Add numbers",
            description: "Add two numbers together",
            inputSchema: { a: z.number(), b: z.number() },
        },
        async ({ a, b }) => ({
            content: [{ type: "text", text: String(a + b) }],
        })
    );

    return server;
}

const app = new Hono();

app.all("/mcp", async (c) => {
    // Fresh server + transport per request = stateless
    const server = createServer();
    const transport = new StreamableHTTPTransport({
        sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    return transport.handleRequest(c);
});

serve({ fetch: app.fetch, port: 3000, hostname: "127.0.0.1" }, (info) =>
    console.log(`MCP server on http://127.0.0.1:${info.port}/mcp`)
);
