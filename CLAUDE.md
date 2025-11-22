# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Pokemote** is a dual-purpose Node.js application that serves as both:
1. A REST API server for controlling LG WebOS Smart TVs
2. An MCP (Model Context Protocol) server for AI agents to control TVs

## Technology Stack

- **Language**: TypeScript with ESNext modules (ESM)
- **Runtime**: Node.js 18+ with tsx for TypeScript execution
- **Web Framework**: Express.js with CORS support
- **Database**: Better SQLite3 for credential persistence
- **Communication**: WebSockets (ws library) for TV control
- **Discovery**: SSDP/UPnP protocol for automatic TV detection
- **Real-time**: Server-Sent Events (SSE) for live TV state subscriptions

## Development Commands

```bash
npm run dev        # Start REST API with file watching (port 3000)
npm start         # Start REST API in production
npm run mcp       # Start MCP server (port 3333)
npm run mcp:dev   # Start MCP server with file watching

# Docker Commands
npm run docker:build   # Build Docker image
npm run docker:run     # Run Docker container with .env file
npm run docker:dev     # Run with docker-compose (development)
npm run docker:prod    # Run with docker-compose + nginx (production)
npm run docker:stop    # Stop containers
npm run docker:logs    # View container logs
npm run docker:clean   # Clean up containers and images
```

## Architecture

### Dual-Server Structure
- **REST API Server** (`src/index.ts`): Full-featured HTTP API on port 3000
- **MCP Server** (`src/mcp-server.ts`): JSON-RPC interface on port 3333 for AI agents

### Key Components
- `src/tv/client.ts`: WebSocket client for WebOS communication
- `src/tv/commands.ts`: High-level TV control commands
- `src/tv/database.ts`: SQLite credential management
- `src/tv/discovery.ts`: SSDP TV discovery
- `src/tv/store.ts`: Legacy credential storage
- `src/auth.ts`: API key authentication system with sk- prefix support
- `src/mcp-server.ts`: MCP server with integrated authentication

### Connection Management
- **Auto-reconnection**: Automatic reconnect using stored credentials
- **Connection State**: Global state tracking with `tvClient`, `tvCommands`, `currentTVIP`
- **Pending Pairings**: Map for PIN-based authentication flows
- **Database Schema**: `tv_credentials` table stores `ip`, `client_key`, `secure`, `name`, timestamps, `is_valid`

## TV Control Features

### Authentication Flow
1. **Discovery**: SSDP/UPnP broadcast to find TVs
2. **Pairing**: PIN-based authentication with 6-digit code
3. **Storage**: SQLite credential persistence for auto-reconnection

### Control Categories
- **Audio**: Volume, mute, audio output switching
- **Media**: Play/pause/stop, rewind/fast-forward
- **System**: Power control, screen on/off, notifications
- **Apps**: List, launch, running apps detection
- **Channels**: Channel navigation, current channel info
- **Input**: HDMI/input source switching
- **Navigation**: Remote control (up/down/left/right/OK/back/home)
- **Search**: webOS Unified Search across streaming apps

### Real-time Features (SSE)
- Volume changes: `/api/subscribe/volume`
- Channel changes: `/api/subscribe/channel`
- App switches: `/api/subscribe/app`
- Media state: `/api/subscribe/media`
- All events: `/api/subscribe/all`

## MCP Integration

The MCP server exposes TV control as AI tools:
- `discover_tvs`, `connect`, `pair`, `disconnect`, `status`
- `power`, `volume_up/down/set`, `get_volume`, `media` controls
- `remote` navigation, `list_apps`, `open_app`, `search`

## Environment Configuration

- `PORT`: REST API port (default 3000)
- `MCP_PORT`: MCP server port (default 3333)

### Authentication Settings
- `MCP_AUTH_ENABLED`: Enable/disable API key authentication (default: true)
- `MCP_API_KEYS`: Comma-separated list of API keys (must start with "sk-")

### Security Settings
- `MCP_DNS_PROTECT`: Enable DNS protection (default: false)
- `MCP_ALLOWED_HOSTS`: Restrict to specific hostnames (comma-separated)
- `MCP_ALLOWED_ORIGINS`: Restrict to specific origins (comma-separated)

### API Key Format
All API keys must:
- Start with "sk-" prefix (similar to OpenAI keys)
- Be at least 10 characters long total
- Example: `sk-1234567890abcdef`

Use `.env.example` as a template for configuration.

## Important Notes

- TVs must be on same network, country set to US/UK (India may have WebSocket disabled)
- UDP port 1900 must be open for SSDP discovery
- Some routers block multicast traffic
- Connection may require secure/non-secure mode detection
- TV credentials stored in SQLite (excluded from git)
- WebSocket security: Newer TVs require secure (wss://) connections
- PIN-based pairing prevents unauthorized access

## Docker Deployment

### Quick Start
```bash
# Copy environment template and configure
cp .env.example .env
# Edit .env with your API keys

# Run with Docker Compose
npm run docker:dev

# Or build and run manually
npm run docker:build
npm run docker:run
```

### Docker Configuration
- **Base Image**: Node.js 18 Alpine for smaller size
- **Ports**: 8432 (MCP), 8567 (REST API), 8480 (Nginx HTTP), 8443 (Nginx HTTPS)
- **Data Volume**: `/app/data` for SQLite database persistence
- **Security**: Runs as non-root user
- **Health Check**: Built-in health monitoring

### Production Deployment
```bash
# Production with Nginx reverse proxy
npm run docker:prod

# View logs
npm run docker:logs

# Stop services
npm run docker:stop
```

## Authentication Endpoints

### Health Check (No Auth)
```bash
GET /health
# Returns server status, TV connection, and auth requirements
```

### Auth Status (No Auth)
```bash
GET /auth/status
# Returns authentication configuration and requirements
```

### MCP JSON-RPC (Auth Required)
```bash
POST /mcp
Authorization: Bearer sk-your-api-key
# MCP protocol endpoint for AI agents
```

## Code Structure

- TypeScript strict mode enabled with ESNext target
- Modular architecture with clear separation of concerns
- Comprehensive JSDoc comments throughout
- Error handling with proper HTTP status codes
- Integrated authentication with API key support
- Docker support for production deployment
- No test suite present