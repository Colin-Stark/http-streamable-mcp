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

    // ---- create_account --------------------------------------------------------
    server.registerTool(
        "create_account",
        {
            title: "Create Account",
            description: "Create a new bank account. You must log in first.",
            inputSchema: z.object({
                account_type: z.enum(["checking", "savings", "credit"]),
            }),
        },
        async ({ account_type }) => {
            try {
                const account = await callProtected(sessionId, "/accounts", {
                    method: "POST",
                    body: { account_type }
                });
                return textResult(
                    `Account created successfully:\n- ID: ${account.id}\n- Type: ${account.account_type}\n- Balance: ${account.balance}\n- Created at: ${account.created_at}`
                );
            } catch (err) {
                return errorResult(err.message);
            }
        }
    );
}