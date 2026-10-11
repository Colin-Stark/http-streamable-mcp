// =============================================================================
// tools/accounts.js: tools that call PROTECTED account endpoints (JWT needed)
// =============================================================================
import { z } from "zod";
import { textResult, errorResult } from "../lib/results.js";
import { callProtected } from "../lib/bank.js";

export function registerAccountTools(server, { sessionId }) {
    // ---- list_accounts ---------------------------------------------------------
    // Compare this with the earlier version: all the token lookup, decryption, URL
    // building and 401 handling now happens inside callProtected().
    server.registerTool(
        "list_accounts",
        {
            title: "List Accounts",
            description: "List your bank accounts. You must log in first. Optionally filter by account type.",
            inputSchema: {
                account_type: z.enum(["checking", "savings", "credit"]).optional(),
            },
        },
        async ({ account_type }) => {
            try {
                const accounts = await callProtected(sessionId, "/accounts", {
                    query: { account_type },
                });
                return textResult(JSON.stringify(accounts, null, 2));
            } catch (err) {
                return errorResult(err.message);
            }
        }
    );
}