# LG WebOS TV API Server

A modern REST API server to control LG WebOS Smart TVs, built with Node.js and Express.

## Features

- 🔍 Automatic TV discovery using SSDP/UPnP
- 🔐 Secure WebSocket authentication with credential storage
- 🎮 Full TV control via REST API
- 📡 **Real-time event subscriptions** - Listen to volume, channel, and app changes!
- 🔎 **webOS Unified Search** - Search content across ALL installed streaming apps (Netflix, Disney+, etc.)
- ⚡ Built with Express for reliability
- 📝 TypeScript for type safety

## Prerequisites

- [Node.js](https://nodejs.org) v18+ installed
- LG WebOS Smart TV on the same network
- TV must be turned on and **country set to US/UK** (India region may have WebSocket disabled)

## Quick Start

### 1. Install Dependencies

```bash
cd lgtv-api
npm install
```

### 2. Start the Server

```bash
npm run dev
```

The server will start on `http://localhost:3000`

### 3. Discover Your TV

```bash
curl http://localhost:3000/api/discover
```

This will scan your network and return available LG TVs.

### 4. Connect to TV

```bash
curl -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -d '{"ip": "192.168.1.100", "secure": true}'
```

**Important:** When connecting for the first time, your TV will display a pairing prompt. Accept it on the TV screen. The API will automatically save the authentication token for future use.

### 5. Control Your TV

```bash
# Volume up
curl -X POST http://localhost:3000/api/volume/up

# Volume down
curl -X POST http://localhost:3000/api/volume/down

# Set volume to 50
curl -X POST http://localhost:3000/api/volume/set \
  -H "Content-Type: application/json" \
  -d '{"volume": 50}'

# Mute
curl -X POST http://localhost:3000/api/volume/mute \
  -H "Content-Type: application/json" \
  -d '{"mute": true}'

# Send notification to TV
curl -X POST http://localhost:3000/api/system/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from the API!"}'
```

## API Endpoints

### Discovery & Connection

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/discover` | Discover TVs on network |
| POST | `/api/connect` | Connect to TV (body: `{ip, secure}`) |
| POST | `/api/disconnect` | Disconnect from TV |
| GET | `/api/status` | Check connection status |

### Volume Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/volume/up` | Increase volume |
| POST | `/api/volume/down` | Decrease volume |
| POST | `/api/volume/set` | Set volume (body: `{volume: 0-100}`) |
| GET | `/api/volume` | Get current volume |
| POST | `/api/volume/mute` | Mute/unmute (body: `{mute: true/false}`) |

### Media Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/media/play` | Play |
| POST | `/api/media/pause` | Pause |
| POST | `/api/media/stop` | Stop |
| POST | `/api/media/rewind` | Rewind |
| POST | `/api/media/fastforward` | Fast forward |

### System Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/system/power-off` | Turn off TV |
| POST | `/api/system/screen-off` | Turn off screen only |
| POST | `/api/system/screen-on` | Turn on screen |
| GET | `/api/system/info` | Get TV system info |
| POST | `/api/system/notify` | Show notification (body: `{message}`) |

### Application Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/apps` | List installed apps |
| POST | `/api/apps/launch` | Launch app (body: `{appId, contentId?, params?}`) |
| GET | `/api/apps/current` | Get current app |

### Channel Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/channels/up` | Channel up |
| POST | `/api/channels/down` | Channel down |
| GET | `/api/channels` | List all channels |
| GET | `/api/channels/current` | Get current channel |
| POST | `/api/channels/set` | Set channel (body: `{channelId}`) |

### Input Source Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/inputs` | List input sources (HDMI, etc.) |
| POST | `/api/inputs/set` | Switch input (body: `{inputId}`) |

### Real-Time Subscriptions (SSE)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/subscribe/volume` | Subscribe to volume/mute changes |
| GET | `/api/subscribe/channel` | Subscribe to channel changes |
| GET | `/api/subscribe/app` | Subscribe to app/input changes |
| GET | `/api/subscribe/all` | Subscribe to all events |
| GET | `/api/subscriptions` | List active subscriptions |

**📡 See [SUBSCRIPTIONS.md](./SUBSCRIPTIONS.md) for detailed guide and examples!**

### webOS Unified Search

Search content across ALL installed streaming apps using webOS's native search service.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/search/content` | Search content in Netflix, Disney+, etc. (body: `{query}`) |
| POST | `/api/search/launch-home` | **Launch Home app with search** - Opens TV's search UI (body: `{query}`) |
| POST | `/api/search/launch-result` | Launch specific content (body: `{appId, contentId, params}`) |
| GET | `/api/search/suggestions?q=query` | Get search suggestions for partial queries |

**No authentication needed** - Works directly through TV connection!

## Examples

### webOS Unified Search

The webOS Unified Search feature lets you search for movies, TV shows, and content across **all your installed streaming apps** (Netflix, Disney+, Prime Video, etc.) using webOS's native search service.

**No authentication required** - Just connect to your TV!

#### Launch TV Search (Recommended!)

The easiest way - opens the TV's native search interface:

```bash
# Launch Home app with search for "Avengers"
curl -X POST http://localhost:3000/api/search/launch-home \
  -H "Content-Type: application/json" \
  -d '{"query": "Avengers"}'

# This opens the TV's Home app with "Avengers" search populated
# You'll see search results on your TV screen instantly!
```

#### Search via API

Search programmatically and get results as JSON:

```bash
# Search for "Avengers" across all installed streaming apps
curl -X POST http://localhost:3000/api/search/content \
  -H "Content-Type: application/json" \
  -d '{"query": "Avengers"}'

# Search for a TV show
curl -X POST http://localhost:3000/api/search/content \
  -H "Content-Type: application/json" \
  -d '{"query": "Breaking Bad"}'
```

**Response:**
```json
{
  "success": true,
  "query": "Avengers",
  "results": {
    "apps": [
      {
        "appId": "netflix",
        "title": "Netflix",
        "results": [
          {
            "title": "Avengers: Endgame",
            "uri": "...",
            "thumbnail": "..."
          }
        ]
      },
      {
        "appId": "com.disney.disneyplus-prod",
        "title": "Disney+",
        "results": [
          {
            "title": "Avengers: Infinity War",
            "uri": "...",
            "thumbnail": "..."
          }
        ]
      }
    ]
  }
}
```

#### Get Search Suggestions

```bash
# Get suggestions for partial query
curl "http://localhost:3000/api/search/suggestions?q=Aven"
```

#### Launch Specific Content (Advanced)

If your TV returns structured search results with app and content IDs, you can launch specific content:

```bash
# Launch Netflix with specific content ID
curl -X POST http://localhost:3000/api/search/launch-result \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "netflix",
    "contentId": "80057281"
  }'

# Launch Disney+ with content and params
curl -X POST http://localhost:3000/api/search/launch-result \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "com.disney.disneyplus-prod",
    "contentId": "series/12345",
    "params": {"season": 1, "episode": 1}
  }'
```

**How it works:**
- **Method 1 (Recommended):** Launch Home app with search - Opens TV's native search UI
  - Your TV performs the search and shows results visually
  - User can browse and select content directly on TV
  - Most reliable method across all TV models
  
- **Method 2:** API search (if supported) - Returns structured JSON results  
  - Some TV models return search results with `appId` and `contentId`
  - These can be used to programmatically launch specific content
  - Falls back to Method 1 if not supported

**Note:** Most consumer LG TVs use Method 1 (visual search). Structured API results are typically available on developer/commercial models.

### Listen to Real-Time Events

```bash
# Subscribe to volume changes (keeps connection open)
curl -N -H "Accept: text/event-stream" \
  http://localhost:3000/api/subscribe/volume

# Now use your TV remote to change volume - you'll see events in real-time!
```

**See [SUBSCRIPTIONS.md](./SUBSCRIPTIONS.md) for complete guide with JavaScript, Python, and Node.js examples!**

### Launch YouTube

```bash
# First, get list of apps to find YouTube's appId
curl http://localhost:3000/api/apps

# Launch YouTube
curl -X POST http://localhost:3000/api/apps/launch \
  -H "Content-Type: application/json" \
  -d '{"appId": "youtube.leanback.v4"}'

# Launch YouTube with specific video
curl -X POST http://localhost:3000/api/apps/launch \
  -H "Content-Type: application/json" \
  -d '{"appId": "youtube.leanback.v4", "contentId": "v=dQw4w9WgXcQ"}'
```

### Switch to HDMI 1

```bash
# Get list of inputs
curl http://localhost:3000/api/inputs

# Switch to HDMI 1
curl -X POST http://localhost:3000/api/inputs/set \
  -H "Content-Type: application/json" \
  -d '{"inputId": "HDMI_1"}'
```

### Get TV Info

```bash
curl http://localhost:3000/api/system/info
```

## Configuration

### Environment Variables

- `PORT` - Server port (default: 3000)

### Secure vs Non-Secure Connection

Newer LG TVs require secure WebSocket connections (wss://:3001). Older models use non-secure (ws://:3000).

```json
{
  "ip": "192.168.1.100",
  "secure": true  // Use true for newer TVs, false for older ones
}
```

## Credentials Storage

Authentication credentials are automatically saved to `tv-credentials.json` in the project root. This file contains:

```json
{
  "ip": "192.168.1.100",
  "clientKey": "authentication-token-from-tv",
  "secure": true
}
```

Keep this file secure and don't commit it to version control!

## Development

### Run in Development Mode

```bash
npm run dev
```

This will watch for file changes and automatically restart the server.

### Run in Production

```bash
npm start
```

## Troubleshooting

### TV Not Discovered

- Ensure TV is on and connected to the same network
- Check firewall settings (UDP port 1900 must be open)
- Some routers block multicast traffic - check router settings

### Connection Reset by Peer

- Your TV likely requires secure connection - try `"secure": true`
- Older TVs may require `"secure": false`

### Authentication Failed

- Delete `tv-credentials.json` and reconnect
- Make sure you accept the pairing prompt on TV screen
- TV may have been factory reset - credentials need to be regenerated

### Command Returns Error

- Check that TV is on and connected
- Verify you're connected first with `/api/status`
- Some commands may not work depending on TV state (e.g., channel controls when watching Netflix)

## Architecture

The implementation consists of:

1. **Discovery Module** (`src/tv/discovery.ts`) - SSDP/UPnP device discovery
2. **Client Module** (`src/tv/client.ts`) - WebSocket client with authentication
3. **Commands Module** (`src/tv/commands.ts`) - High-level TV control commands
4. **Store Module** (`src/tv/store.ts`) - Credential persistence
5. **API Server** (`src/index.ts`) - Express REST API server

---

## License

MIT

## Credits

Based on the protocol analysis of [PyWebOSTV](https://github.com/supersaiyanmode/PyWebOSTV)

