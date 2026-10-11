// =============================================================================
// index.js: the HTTP entry point. Tools live in the tools/ folder.
// =============================================================================
import { randomUUID } from "node:crypto";                                         // makes new session IDs
import { Hono } from "hono";                                                      // web framework for the /mcp route
import { serve } from "@hono/node-server";                                        // runs Hono as a Node server locally
import { StreamableHTTPTransport } from "@hono/mcp";                              // MCP over HTTP, on top of Hono
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";              // the MCP server object
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";         // detects the first "initialize" handshake
import { registerAllTools } from "./tools/index.js";                              // all tools, in one call

// sessionId = the ID the client sent in its "Mcp-Session-Id" header (undefined if none).
// It tells the tools which Redis entry belongs to THIS client. The model never sees it.
function createServer(sessionId) {
    /**
     * Create a new MCP server instance.
     * @returns {McpServer} The created MCP server.
     */
    const server = new McpServer({
        name: "my_bank_api",
        version: "1.0.0",
        description: "A simple bank API for demonstration purposes",
    });

    // Attach every tool to this server, passing along the per-request context.
    registerAllTools(server, { sessionId });

    return server;
}

// =============================================================================
// THE HTTP ENTRY POINT
// =============================================================================

const app = new Hono();

app.all("/mcp", async (c) => {
    // 1. Which client is this? Clients echo back the ID we gave them in this header.
    //    We only accept values that look like a UUID (36 characters of hex and dashes).
    const headerValue = c.req.header("mcp-session-id");
    const sessionId = headerValue && /^[0-9a-f-]{36}$/i.test(headerValue) ? headerValue : undefined;

    // 2. Read the JSON body ourselves (POST only) so we can check for "initialize" below.
    let body;
    if (c.req.method === "POST") {
        try {
            body = await c.req.json();
        } catch {
            return c.json({ jsonrpc: "2.0", error: { code: -32700, message: "Invalid JSON" }, id: null }, 400);
        }
    }

    // 3. Same stateless setup as before: fresh server + transport per request.
    const server = createServer(sessionId);
    const transport = new StreamableHTTPTransport({
        sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    const response = await transport.handleRequest(c, body);

    // 4. On the first "initialize" handshake, give the client a new session ID in a header.
    //    The client sends it back on every later request, which is how we recognise it.
    if (body && isInitializeRequest(body)) {
        const withSession = new Response(response.body, response); // copy, since headers can't be edited
        withSession.headers.set("Mcp-Session-Id", randomUUID());
        return withSession;
    }

    return response;
});

serve({ fetch: app.fetch, port: 3000, hostname: "127.0.0.1" }, (info) =>
    console.log(`MCP server on http://127.0.0.1:${info.port}/mcp`)
);