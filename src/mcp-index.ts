#!/usr/bin/env node

import { PokemoteMCPServer } from "./mcp-server.js";

/**
 * Pokemote MCP Server Entry Point
 * 
 * Runs the MCP server in HTTP mode on port 3333
 * External AI agents can connect via HTTP JSON-RPC protocol
 */

const server = new PokemoteMCPServer();
const port = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT) : 3333;

console.log('🚀 Starting Pokemote MCP Server in HTTP mode...');
console.log('📺 Control your LG WebOS TV with AI agents');
console.log('');

server.runHTTP(port).catch((error) => {
  console.error('❌ Failed to start MCP server:', error);
  process.exit(1);
});

