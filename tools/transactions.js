// =============================================================================
// tools/transactions.js: tools that call PROTECTED transaction endpoints (JWT needed)
// =============================================================================
import { z } from "zod";
import { textResult, errorResult } from "../lib/results.js";
import { callProtected } from "../lib/bank.js";

export function registerTransactionTools(server, { sessionId }) {
    // ---- list_transactions ---------------------------------------------------------
    server.registerTool(
        "list_transactions",
        {
            title: "List Transactions",
            description: "List your bank transactions. You must log in first. Optionally filter by account ID, transaction type, and date range. Supports pagination.",
            inputSchema: z.object({
                account_id: z.string().uuid().optional(),
                type: z.enum(["deposit", "withdrawal", "transfer"]).optional(),
                start_date: z.string().datetime().optional(),
                end_date: z.string().datetime().optional(),
                limit: z.number().int().min(1).max(100).default(50).optional(),
                offset: z.number().int().min(0).default(0).optional(),
            }),
        },
        async ({ account_id, type, start_date, end_date, limit, offset }) => {
            try {
                const transactions = await callProtected(sessionId, "/transactions", {
                    query: {
                        account_id,
                        type,
                        start_date,
                        end_date,
                        limit,
                        offset
                    }
                });
                return textResult(JSON.stringify(transactions, null, 2));
            } catch (err) {
                return errorResult(err.message);
            }
        }
    );

    // ---- create_transaction --------------------------------------------------------
    server.registerTool(
        "create_transaction",
        {
            title: "Create Transaction",
            description: "Create a new deposit or withdrawal transaction. You must log in first.",
            inputSchema: z.object({
                account_id: z.string().uuid(),
                type: z.enum(["deposit", "withdrawal"]),
                amount: z.string().regex(/^\d+\.\d{2}$/),
                description: z.string().max(255).optional(),
                idempotency_key: z.string().uuid().optional(),
            }),
        },
        async ({ account_id, type, amount, description, idempotency_key }) => {
            try {
                const transaction = await callProtected(sessionId, "/transactions", {
                    method: "POST",
                    body: {
                        account_id,
                        type,
                        amount,
                        description,
                        idempotency_key
                    }
                });
                return textResult(
                    `Transaction created successfully:\n- ID: ${transaction.id}\n- Account ID: ${transaction.account_id}\n- Type: ${transaction.type}\n- Amount: ${transaction.amount}\n- Description: ${description ?? "(none)"}\n- Created at: ${transaction.created_at}`
                );
            } catch (err) {
                return errorResult(err.message);
            }
        }
    );

    // ---- create_transfer -----------------------------------------------------------
    server.registerTool(
        "create_transfer",
        {
            title: "Create Transfer",
            description: "Create a new transfer between accounts. You must log in first.",
            inputSchema: z.object({
                source_account_id: z.string().uuid(),
                destination_account_id: z.string().uuid(),
                amount: z.string().regex(/^\d+\.\d{2}$/),
                description: z.string().max(255).optional(),
                idempotency_key: z.string().uuid().optional(),
            }),
        },
        async ({ source_account_id, destination_account_id, amount, description, idempotency_key }) => {
            try {
                const transfer = await callProtected(sessionId, "/transfers", {
                    method: "POST",
                    body: {
                        source_account_id,
                        destination_account_id,
                        amount,
                        description,
                        idempotency_key
                    }
                });
                return textResult(
                    `Transfer created successfully:\n- ID: ${transfer.id}\n- Source Account: ${transfer.source_account_id}\n- Destination Account: ${transfer.destination_account_id}\n- Amount: ${transfer.amount}\n- Description: ${description ?? "(none)"}\n- Created at: ${transfer.created_at}`
                );
            } catch (err) {
                return errorResult(err.message);
            }
        }
    );

    // ---- get_transaction -----------------------------------------------------------
    server.registerTool(
        "get_transaction",
        {
            title: "Get Transaction",
            description: "Get details of a specific transaction by ID. You must log in first.",
            inputSchema: z.object({
                transaction_id: z.string().uuid(),
            }),
        },
        async ({ transaction_id }) => {
            try {
                const transaction = await callProtected(sessionId, `/transactions/${transaction_id}`);
                return textResult(JSON.stringify(transaction, null, 2));
            } catch (err) {
                return errorResult(err.message);
            }
        }
    );
}