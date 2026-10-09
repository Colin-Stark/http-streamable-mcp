import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// Build a fresh server per request (stateless mode)
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

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // undefined = stateless, no sessions
    });

    res.on("close", () => {
        transport.close();
        server.close();
    });

    try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (err) {
        console.error(err);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: "2.0",
                error: { code: -32603, message: "Internal server error" },
                id: null,
            });
        }
    }
});

// Stateless servers don't offer a standalone SSE stream or session teardown
const notAllowed = (req, res) =>
    res.status(405).set("Allow", "POST").json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
    });
app.get("/mcp", notAllowed);
app.delete("/mcp", notAllowed);

const PORT = process.env.PORT || 3000;
app.listen(PORT, "127.0.0.1", () =>
    console.log(`MCP server listening on http://127.0.0.1:${PORT}/mcp`)
);