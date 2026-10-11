# Fastify to MCP Bank Server

An MCP (Model Context Protocol) server that interfaces with a bank API, providing tools for account management, transactions, and authentication.

## Overview

This project implements an MCP server that exposes banking functionality through standardized MCP tools. The server connects to a bank API and provides:

- **Public tools**: Health check, user registration
- **Authentication tools**: Login, logout (with JWT token management)
- **Account tools**: List accounts, create accounts
- **Transaction tools**: List transactions, create deposits/withdrawals, create transfers, get transaction details

The server uses the Hono framework for handling HTTP requests and Upstash Redis for session management.

## Deployment

This MCP server has been deployed on Vercel and is accessible as an HTTP streamable MCP at:
**https://http-streamable-mcp.vercel.app/mcp**

You can connect to this endpoint using any MCP client that supports streamable HTTP transport.

## Usage

To use this MCP server with MCP-compatible clients like Claude Desktop, Claude Code, or GitHub Copilot Chat, configure the client to connect to the streamable HTTP endpoint.

### Using with Claude Desktop / Claude Code

1. Open Claude Desktop or Claude Code settings.
2. Navigate to the MCP Servers configuration.
3. Add a new MCP server with the following details:
   - **Name**: Bank MCP (or any name)
   - **Type**: Streamable HTTP
   - **URL**: `https://http-streamable-mcp.vercel.app/mcp`
4. Save the configuration.
5. Once connected, you can invoke the available tools (e.g., `list_accounts`, `create_transaction`) directly from Claude's chat interface.

### Using with GitHub Copilot Chat

GitHub Copilot Chat supports MCP servers via the MCP plugin (if available). To connect:
1. Ensure you have the MCP plugin enabled in GitHub Copilot settings.
2. Add a new MCP server:
   - **Name**: Bank MCP
   - **URL**: `https://http-streamable-mcp.vercel.app/mcp`
   - **Transport**: Streamable HTTP
3. After connecting, you can use the bank tools in Copilot Chat by invoking them as you would any MCP tool.

### Available Tools

#### Public Tools
- `health_check`: Check the health of the bank API
- `register_user`: Register a new user with the bank API

#### Authentication Tools
- `login`: Log in to the bank API (stores JWT securely)
- `logout`: Log out and delete the stored access token

#### Account Tools
- `list_accounts`: List your bank accounts (optionally filter by account type)
- `create_account`: Create a new bank account (checking, savings, or credit)

#### Transaction Tools
- `list_transactions`: List your bank transactions with filtering options
- `create_transaction`: Create a new deposit or withdrawal transaction
- `create_transfer`: Create a new transfer between accounts
- `get_transaction`: Get details of a specific transaction by ID

### Tool Parameters

Each tool includes detailed parameter validation. Refer to the individual tool files for specific parameter requirements.

## Sample Accounts for Testing

For testing transfers, you can use the following pre-existing accounts:

| Type | Account ID | Balance |
|------|------------|---------|
| Checking | 0ac15ed6-03bb-41ca-a935-5a662cd39a35 | 500.00 |
| Savings | 02edb41f-70af-485a-b8a8-84451766a148 | 300.00 |

## API Endpoints

The server interacts with the following bank API endpoints:

- `GET /health` - Health check
- `POST /user/register` - User registration
- `POST /user/login` - User login
- `DELETE /user/logout` - User logout
- `GET /accounts` - List accounts
- `POST /accounts` - Create account
- `GET /transactions` - List transactions
- `POST /transactions` - Create transaction
- `GET /transactions/{id}` - Get transaction details
- `POST /transfers` - Create transfer

## Security

- JWT tokens are encrypted before storage in Redis
- Tokens automatically expire after 1 hour
- Invalid tokens are automatically cleared when detected
- All API calls include proper authorization headers
- Input validation prevents injection attacks

## Dependencies

- `@hono/mcp`: MCP integration for Hono
- `@hono/node-server`: Node.js server adapter for Hono
- `@modelcontextprotocol/sdk`: Official MCP SDK
- `@upstash/redis`: Redis client (Upstash)
- `dotenv`: Environment variable loading
- `hono`: Web framework
- `zod`: Input validation

## License

MIT

## Acknowledgments

- Bank API interface based on the fastify-api-xi service
- Uses Hono framework for efficient HTTP handling