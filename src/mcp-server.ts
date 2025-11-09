import express from 'express';
import cors from 'cors';
import { discoverTVs } from "./tv/discovery.js";
import { LGTVClient } from "./tv/client.js";
import { TVCommands } from "./tv/commands.js";
import { tvDatabase } from "./tv/database.js";
import {
  tvClient,
  tvCommands,
  currentTVIP,
  pendingPairings,
  autoReconnect,
  ensureConnection,
  setTVClient,
} from "./index.js";

interface MCPRequest {
  jsonrpc: string;
  id?: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: string;
  id?: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

export class PokemoteMCPServer {
  constructor() {}

  /**
   * Get list of all available tools
   */
  getTools() {
    return [
      // Discovery & Connection Tools
      {
        name: "discover_tvs",
        description: "Discover LG WebOS TVs on the local network. Returns a list of TVs with their IP addresses, names, and model information. Use this first to find available TVs before connecting.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "connect_tv",
        description: "Initiate connection to an LG TV by IP address. This will display a PIN code on the TV screen. After calling this, you MUST call pair_tv with the PIN to complete the connection. Parameters: ip (required, string) - TV IP address from discover_tvs; secure (optional, boolean) - use secure connection (default: true); name (optional, string) - friendly name for the TV.",
        inputSchema: {
          type: "object",
          properties: {
            ip: {
              type: "string",
              description: "IP address of the TV (e.g., '192.168.1.100')",
            },
            secure: {
              type: "boolean",
              description: "Use secure WebSocket connection (wss). Default: true",
            },
            name: {
              type: "string",
              description: "Friendly name for the TV (e.g., 'Living Room TV')",
            },
            force: {
              type: "boolean",
              description: "Force reconnection even if already connected. Default: false",
            },
          },
          required: ["ip"],
        },
      },
      {
        name: "pair_tv",
        description: "Complete TV pairing using the PIN code displayed on the TV screen after calling connect_tv. This finalizes the authentication and saves credentials for future auto-reconnect. Parameters: pin (required, string) - 6-digit PIN shown on TV; ip (optional, string) - TV IP if different from current; name (optional, string) - friendly name.",
        inputSchema: {
          type: "object",
          properties: {
            pin: {
              type: "string",
              description: "6-digit PIN code displayed on the TV screen",
            },
            ip: {
              type: "string",
              description: "IP address of the TV (optional if already in pairing flow)",
            },
            name: {
              type: "string",
              description: "Friendly name for the TV",
            },
          },
          required: ["pin"],
        },
      },
      {
        name: "disconnect_tv",
        description: "Disconnect from the currently connected TV. Does not delete saved credentials - use delete_saved_tv for that.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "reconnect_tv",
        description: "Reconnect to a TV using previously saved credentials. If no IP is specified, connects to the most recently used TV. This is useful for quick reconnection without needing to pair again.",
        inputSchema: {
          type: "object",
          properties: {
            ip: {
              type: "string",
              description: "IP address of the TV to reconnect to (optional - uses most recent if not provided)",
            },
          },
        },
      },
      {
        name: "get_connection_status",
        description: "Get the current connection status including whether connected, authenticated, current TV IP, and number of saved TVs in database.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "list_saved_tvs",
        description: "List all TVs with saved credentials in the database. Shows IP address, friendly name, connection type (secure/non-secure), validity status, and last used timestamp for each TV.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "delete_saved_tv",
        description: "Delete saved credentials for a specific TV by IP address. Use this when you want to remove a TV from the database or re-pair with fresh credentials.",
        inputSchema: {
          type: "object",
          properties: {
            ip: {
              type: "string",
              description: "IP address of the TV to delete credentials for",
            },
          },
          required: ["ip"],
        },
      },
      {
        name: "get_system_info",
        description: "Get detailed system information about the connected TV including model, firmware version, WebOS version, and other technical details.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },

      // Volume Control Tools
      {
        name: "volume_up",
        description: "Increase the TV volume by 1 level. Equivalent to pressing the volume up button on the remote.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "volume_down",
        description: "Decrease the TV volume by 1 level. Equivalent to pressing the volume down button on the remote.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "volume_set",
        description: "Set the TV volume to a specific level. Parameters: volume (required, number 0-100) - target volume level where 0 is mute and 100 is maximum.",
        inputSchema: {
          type: "object",
          properties: {
            volume: {
              type: "number",
              description: "Volume level from 0 (mute) to 100 (maximum)",
              minimum: 0,
              maximum: 100,
            },
          },
          required: ["volume"],
        },
      },
      {
        name: "volume_get",
        description: "Get the current volume level and mute status of the TV. Returns volume (0-100) and muted (boolean).",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "volume_mute",
        description: "Mute or unmute the TV audio. Parameters: mute (required, boolean) - true to mute, false to unmute.",
        inputSchema: {
          type: "object",
          properties: {
            mute: {
              type: "boolean",
              description: "true to mute the TV, false to unmute",
            },
          },
          required: ["mute"],
        },
      },

      // Media Control Tools
      {
        name: "media_play",
        description: "Play or resume media playback. Works with apps like YouTube, Netflix, and other media players. Equivalent to pressing the Play button.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "media_pause",
        description: "Pause the currently playing media. Works with apps that support media controls. Equivalent to pressing the Pause button.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "media_stop",
        description: "Stop media playback completely. This is different from pause - it stops and resets the playback position.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "media_rewind",
        description: "Rewind the currently playing media. Skips backward in the content. Equivalent to pressing the Rewind button.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "media_fast_forward",
        description: "Fast forward the currently playing media. Skips forward in the content. Equivalent to pressing the Fast Forward button.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_media_status",
        description: "Get current media playback status including whether content is playing, the current appId, media type, title, duration, and playback position. Works with video/audio apps like YouTube, Netflix, Spotify. Returns playing (boolean), appId (string), and metadata if available.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_foreground_media_info",
        description: "Get detailed information about currently active media apps and content in the foreground. Returns array of foreground app info with details about what's currently playing.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },

      // System Control Tools
      {
        name: "power_off",
        description: "Turn off the TV completely. The TV will shut down and go into standby mode. Use screen_off if you want to turn off just the display while keeping the TV running.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "screen_off",
        description: "Turn off the TV screen/display while keeping the TV powered on. Audio will continue playing if media is active. Use this for 'screen saver' mode or to save power while listening to music.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "screen_on",
        description: "Turn the TV screen/display back on after it was turned off with screen_off. Use this to wake the display.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "notify",
        description: "Display a toast notification message on the TV screen. Great for alerts, reminders, or messages. Parameters: message (required, string) - the text to display on screen.",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "The notification message to display on the TV screen",
            },
          },
          required: ["message"],
        },
      },

      // App Control Tools
      {
        name: "list_apps",
        description: "List all available apps installed on the TV. Returns an array of apps with their appId (used for launching) and title (display name). Examples of common apps: 'youtube.leanback.v4' for YouTube, 'netflix' for Netflix, 'com.webos.app.livetv' for Live TV. Always call this first to get the correct appId before launching an app.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "list_running_apps",
        description: "List all currently running apps on the TV. Shows which apps are active in the background.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_current_app",
        description: "Get information about the currently active/foreground app on the TV. Returns the appId of the app that is currently displayed.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "launch_app",
        description: "Launch an app on the TV by its appId. IMPORTANT: Use list_apps first to get the correct appId. Parameters: appId (required, string) - the app identifier from list_apps (e.g., 'youtube.leanback.v4', 'netflix', 'com.webos.app.livetv'); contentId (optional, string) - deep link to specific content within the app (e.g., YouTube video ID like 'dQw4w9WgXcQ', Netflix title ID); params (optional, object) - additional app-specific parameters as a JSON object (e.g., {\"query\": \"search term\"} for search apps).",
        inputSchema: {
          type: "object",
          properties: {
            appId: {
              type: "string",
              description: "App identifier from list_apps (e.g., 'youtube.leanback.v4', 'netflix', 'com.webos.app.hdmi1')",
            },
            contentId: {
              type: "string",
              description: "Optional deep link content ID (e.g., YouTube video ID, Netflix title ID)",
            },
            params: {
              type: "object",
              description: "Optional JSON object with app-specific parameters (e.g., search query, playback options)",
            },
          },
          required: ["appId"],
        },
      },

      // Channel Control Tools
      {
        name: "channel_up",
        description: "Switch to the next channel. Only works when Live TV or a channel-based input is active.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "channel_down",
        description: "Switch to the previous channel. Only works when Live TV or a channel-based input is active.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "list_channels",
        description: "List all available TV channels. Returns channel information including channel ID, name, and number.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_current_channel",
        description: "Get information about the currently tuned channel including channel ID, name, number, and program information.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "set_channel",
        description: "Switch to a specific channel by its channel ID. Use list_channels first to get available channel IDs. Parameters: channelId (required, string) - the channel identifier from list_channels.",
        inputSchema: {
          type: "object",
          properties: {
            channelId: {
              type: "string",
              description: "Channel identifier from list_channels",
            },
          },
          required: ["channelId"],
        },
      },

      // Input Control Tools
      {
        name: "list_inputs",
        description: "List all available input sources (HDMI ports, AV inputs, etc.). Returns input ID, label, and connection status for each input.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "set_input",
        description: "Switch to a specific input source by its input ID. Use list_inputs first to get available input IDs. Parameters: inputId (required, string) - the input identifier from list_inputs (e.g., 'HDMI_1', 'HDMI_2').",
        inputSchema: {
          type: "object",
          properties: {
            inputId: {
              type: "string",
              description: "Input identifier from list_inputs (e.g., 'HDMI_1', 'HDMI_2', 'HDMI_3')",
            },
          },
          required: ["inputId"],
        },
      },

      // Remote Control Tools
      {
        name: "remote_up",
        description: "Simulate pressing the UP arrow button on the remote control. Use for navigating menus and UI elements upward.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "remote_down",
        description: "Simulate pressing the DOWN arrow button on the remote control. Use for navigating menus and UI elements downward.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "remote_left",
        description: "Simulate pressing the LEFT arrow button on the remote control. Use for navigating menus and UI elements to the left.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "remote_right",
        description: "Simulate pressing the RIGHT arrow button on the remote control. Use for navigating menus and UI elements to the right.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "remote_ok",
        description: "Simulate pressing the OK/Enter button on the remote control. Use to select menu items, confirm actions, or play/pause in some apps.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "remote_back",
        description: "Simulate pressing the BACK button on the remote control. Use to go back in menus, exit apps, or navigate backward in UI.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "remote_home",
        description: "Simulate pressing the HOME button on the remote control. Returns to the TV's home screen/launcher.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },

      // Search Tool
      {
        name: "search_content",
        description: "Search for content across the TV's apps and services. Opens the WebOS universal search interface with the query. Parameters: query (required, string) - search term; categories (optional, array of strings) - content categories to filter by (e.g., ['movie', 'tv', 'app']).",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (e.g., 'Stranger Things', 'Action Movies')",
            },
            categories: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Optional array of categories to filter search (e.g., ['movie', 'tv', 'app'])",
            },
          },
          required: ["query"],
        },
      },
    ];
  }

  /**
   * Execute a tool by name with given arguments
   */
  async executeTool(name: string, args: any): Promise<any> {
    try {
      switch (name) {
        // Discovery & Connection
        case "discover_tvs":
          return await this.discoverTVs();
        case "connect_tv":
          return await this.connectTV(args);
        case "pair_tv":
          return await this.pairTV(args);
        case "disconnect_tv":
          return await this.disconnectTV();
        case "reconnect_tv":
          return await this.reconnectTV(args);
        case "get_connection_status":
          return await this.getConnectionStatus();
        case "list_saved_tvs":
          return await this.listSavedTVs();
        case "delete_saved_tv":
          return await this.deleteSavedTV(args);
        case "get_system_info":
          return await this.getSystemInfo();

        // Volume Controls
        case "volume_up":
          return await this.volumeUp();
        case "volume_down":
          return await this.volumeDown();
        case "volume_set":
          return await this.volumeSet(args);
        case "volume_get":
          return await this.volumeGet();
        case "volume_mute":
          return await this.volumeMute(args);

        // Media Controls
        case "media_play":
          return await this.mediaPlay();
        case "media_pause":
          return await this.mediaPause();
        case "media_stop":
          return await this.mediaStop();
        case "media_rewind":
          return await this.mediaRewind();
        case "media_fast_forward":
          return await this.mediaFastForward();
        case "get_media_status":
          return await this.getMediaStatus();
        case "get_foreground_media_info":
          return await this.getForegroundMediaInfo();

        // System Controls
        case "power_off":
          return await this.powerOff();
        case "screen_off":
          return await this.screenOff();
        case "screen_on":
          return await this.screenOn();
        case "notify":
          return await this.notify(args);

        // App Controls
        case "list_apps":
          return await this.listApps();
        case "list_running_apps":
          return await this.listRunningApps();
        case "get_current_app":
          return await this.getCurrentApp();
        case "launch_app":
          return await this.launchApp(args);

        // Channel Controls
        case "channel_up":
          return await this.channelUp();
        case "channel_down":
          return await this.channelDown();
        case "list_channels":
          return await this.listChannels();
        case "get_current_channel":
          return await this.getCurrentChannel();
        case "set_channel":
          return await this.setChannel(args);

        // Input Controls
        case "list_inputs":
          return await this.listInputs();
        case "set_input":
          return await this.setInput(args);

        // Remote Controls
        case "remote_up":
          return await this.remoteUp();
        case "remote_down":
          return await this.remoteDown();
        case "remote_left":
          return await this.remoteLeft();
        case "remote_right":
          return await this.remoteRight();
        case "remote_ok":
          return await this.remoteOk();
        case "remote_back":
          return await this.remoteBack();
        case "remote_home":
          return await this.remoteHome();

        // Search
        case "search_content":
          return await this.searchContent(args);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      throw new Error(`Tool execution failed: ${error.message}`);
    }
  }

  // ==================== TOOL IMPLEMENTATIONS ====================

  // Discovery & Connection Tools

  private async discoverTVs() {
    console.log("🔍 Discovering TVs on network...");
    const tvs = await discoverTVs(5000);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            count: tvs.length,
            tvs,
            message: tvs.length > 0 
              ? `Found ${tvs.length} TV(s)` 
              : "No TVs found. Make sure TV is on and on same network.",
          }, null, 2),
        },
      ],
    };
  }

  private async connectTV(args: any) {
    const { ip, secure, name, force = false } = args;

    if (!ip) {
      throw new Error("IP address is required");
    }

    // Check if already connected to this IP
    if (tvClient && currentTVIP === ip && !force) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Already connected",
              ip: currentTVIP,
              clientKey: tvClient.clientKey,
            }, null, 2),
          },
        ],
      };
    }

    // Disconnect existing connection
    if (tvClient) {
      tvClient.disconnect();
      setTVClient(null, null, null);
    }

    // Try to load saved credentials from database
    const stored = tvDatabase.getCredentials(ip);
    const clientKey = stored?.isValid ? stored.clientKey : undefined;

    // Auto-detect secure mode if not specified
    let useSecure = secure !== undefined ? secure : (stored?.secure ?? true);
    let connectionError: Error | null = null;
    let client: LGTVClient | null = null;

    // Try secure connection first, then fall back to non-secure
    const modes = secure !== undefined ? [useSecure] : [true, false];
    
    for (const trySecure of modes) {
      try {
        console.log(`🔌 Connecting to TV at ${ip}:${trySecure ? 3001 : 3000} (${trySecure ? 'secure' : 'non-secure'})...`);
        client = new LGTVClient({ ip, secure: trySecure, clientKey });
        await client.connect();
        useSecure = trySecure;
        connectionError = null;
        break; // Connection successful
      } catch (err: any) {
        console.log(`❌ ${trySecure ? 'Secure' : 'Non-secure'} connection failed: ${err.message}`);
        connectionError = err;
        client = null;
        
        // If user explicitly specified secure mode, don't try fallback
        if (secure !== undefined) {
          throw err;
        }
      }
    }

    if (!client || connectionError) {
      throw new Error(`Failed to connect to TV. Tried both secure and non-secure modes. Last error: ${connectionError?.message}`);
    }

    // Attempt to resolve friendly name if not provided
    let friendlyName: string | undefined = name;
    if (!friendlyName) {
      try {
        const tvs = await discoverTVs(1500);
        const match = tvs.find(t => t.ip === ip);
        if (match?.name) friendlyName = match.name;
      } catch {}
    }

    // Initiate PIN-based pairing
    const result = await client.initiateRegistration();
    
    if (result.requiresPIN) {
      pendingPairings.set(ip, {
        client,
        secure: useSecure,
        name: friendlyName,
      });
      setTVClient(client, null, ip);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "PIN displayed on TV. Enter PIN using pair_tv tool.",
              ip,
              secure: useSecure,
              requiresPIN: true,
              nextStep: "Call pair_tv with the PIN displayed on your TV screen",
            }, null, 2),
          },
        ],
      };
    }

    // Fallback for non-PIN pairing (PROMPT mode)
    const newClientKey = client.clientKey;
    if (newClientKey) {
      tvDatabase.saveCredentials(ip, newClientKey, useSecure, friendlyName);
      const commands = new TVCommands(client);
      setTVClient(client, commands, ip);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Connected and authenticated",
              ip,
              secure: useSecure,
              clientKey: newClientKey,
            }, null, 2),
          },
        ],
      };
    }

    throw new Error("Registration failed");
  }

  private async pairTV(args: any) {
    const { pin, ip, name } = args;

    if (!pin) {
      throw new Error("PIN is required");
    }

    const targetIP = ip || currentTVIP;
    
    if (!targetIP) {
      throw new Error("No active pairing session. Call connect_tv first.");
    }

    const pending = pendingPairings.get(targetIP);
    
    if (!pending) {
      throw new Error(`No pending pairing for ${targetIP}. Call connect_tv first.`);
    }

    const clientKey = await pending.client.completePairing(pin);

    tvDatabase.saveCredentials(targetIP, clientKey, pending.secure, pending.name ?? name);
    const commands = new TVCommands(pending.client);
    setTVClient(pending.client, commands, targetIP);
    pendingPairings.delete(targetIP);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Successfully paired with TV",
            ip: targetIP,
            clientKey,
          }, null, 2),
        },
      ],
    };
  }

  private async disconnectTV() {
    if (tvClient) {
      tvClient.disconnect();
      setTVClient(null, null, null);
    }
    
    // Clear any pending pairings
    pendingPairings.clear();
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Disconnected from TV",
          }, null, 2),
        },
      ],
    };
  }

  private async reconnectTV(args: any) {
    const { ip } = args;
    
    // If already connected, return success
    if (tvClient && (!ip || currentTVIP === ip)) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Already connected",
              ip: currentTVIP,
            }, null, 2),
          },
        ],
      };
    }
    
    // Disconnect current connection
    if (tvClient) {
      tvClient.disconnect();
      setTVClient(null, null, null);
    }
    
    // Reconnect to specified IP or most recent
    const targetIP = ip || tvDatabase.getMostRecentTV()?.ip;
    if (!targetIP) {
      throw new Error("No IP specified and no stored credentials found");
    }
    
    const reconnected = await autoReconnect(targetIP);
    if (!reconnected) {
      throw new Error("Failed to reconnect. Credentials may be expired.");
    }
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Reconnected successfully",
            ip: currentTVIP,
          }, null, 2),
        },
      ],
    };
  }

  private async getConnectionStatus() {
    const connected = !!tvClient;
    const authenticated = !!tvClient?.clientKey;
    
    // Try auto-reconnect if not connected
    if (!connected) {
      const reconnected = await ensureConnection();
      if (reconnected) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                connected: true,
                authenticated: true,
                ip: currentTVIP,
                autoReconnected: true,
                message: "Auto-reconnected using stored credentials",
              }, null, 2),
            },
          ],
        };
      }
    }
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            connected,
            authenticated,
            ip: currentTVIP,
            storedTVs: tvDatabase.getAllCredentials().length,
          }, null, 2),
        },
      ],
    };
  }

  private async listSavedTVs() {
    const credentials = tvDatabase.getAllCredentials();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            count: credentials.length,
            credentials: credentials.map(c => ({
              ip: c.ip,
              name: c.name,
              secure: c.secure,
              isValid: c.isValid,
              createdAt: c.createdAt,
              lastUsed: c.lastUsed,
            })),
          }, null, 2),
        },
      ],
    };
  }

  private async deleteSavedTV(args: any) {
    const { ip } = args;
    if (!ip) {
      throw new Error("IP address is required");
    }
    tvDatabase.deleteCredentials(ip);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: `Deleted credentials for ${ip}`,
          }, null, 2),
        },
      ],
    };
  }

  private async getSystemInfo() {
    await this.ensureConnectionOrThrow();
    const info = await tvCommands!.getSystemInfo();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            info,
          }, null, 2),
        },
      ],
    };
  }

  // Volume Control Tools

  private async volumeUp() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.volumeUp();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Volume increased",
          }, null, 2),
        },
      ],
    };
  }

  private async volumeDown() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.volumeDown();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Volume decreased",
          }, null, 2),
        },
      ],
    };
  }

  private async volumeSet(args: any) {
    await this.ensureConnectionOrThrow();
    const { volume } = args;
    if (volume === undefined || volume < 0 || volume > 100) {
      throw new Error("Volume must be between 0 and 100");
    }
    await tvCommands!.setVolume(volume);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: `Volume set to ${volume}`,
          }, null, 2),
        },
      ],
    };
  }

  private async volumeGet() {
    await this.ensureConnectionOrThrow();
    const volume = await tvCommands!.getVolume();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            volume,
          }, null, 2),
        },
      ],
    };
  }

  private async volumeMute(args: any) {
    await this.ensureConnectionOrThrow();
    const { mute } = args;
    if (mute === undefined) {
      throw new Error("mute parameter is required (true or false)");
    }
    await tvCommands!.mute(mute);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: mute ? "Muted" : "Unmuted",
          }, null, 2),
        },
      ],
    };
  }

  // Media Control Tools

  private async mediaPlay() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.play();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Playing",
          }, null, 2),
        },
      ],
    };
  }

  private async mediaPause() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.pause();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Paused",
          }, null, 2),
        },
      ],
    };
  }

  private async mediaStop() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.stop();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Stopped",
          }, null, 2),
        },
      ],
    };
  }

  private async mediaRewind() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.rewind();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Rewinding",
          }, null, 2),
        },
      ],
    };
  }

  private async mediaFastForward() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.fastForward();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Fast forwarding",
          }, null, 2),
        },
      ],
    };
  }

  private async getMediaStatus() {
    await this.ensureConnectionOrThrow();
    const status = await tvCommands!.getMediaStatus();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            status,
          }, null, 2),
        },
      ],
    };
  }

  private async getForegroundMediaInfo() {
    await this.ensureConnectionOrThrow();
    const info = await tvCommands!.getForegroundMediaInfo();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            info,
          }, null, 2),
        },
      ],
    };
  }

  // System Control Tools

  private async powerOff() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.powerOff();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "TV powering off",
          }, null, 2),
        },
      ],
    };
  }

  private async screenOff() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.screenOff();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Screen off",
          }, null, 2),
        },
      ],
    };
  }

  private async screenOn() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.screenOn();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Screen on",
          }, null, 2),
        },
      ],
    };
  }

  private async notify(args: any) {
    await this.ensureConnectionOrThrow();
    const { message } = args;
    if (!message) {
      throw new Error("message parameter is required");
    }
    await tvCommands!.notify(message);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Notification sent",
          }, null, 2),
        },
      ],
    };
  }

  // App Control Tools

  private async listApps() {
    await this.ensureConnectionOrThrow();
    const apps = await tvCommands!.listApps();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            apps,
          }, null, 2),
        },
      ],
    };
  }

  private async listRunningApps() {
    await this.ensureConnectionOrThrow();
    const apps = await tvCommands!.listRunningApps();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            apps,
          }, null, 2),
        },
      ],
    };
  }

  private async getCurrentApp() {
    await this.ensureConnectionOrThrow();
    const appId = await tvCommands!.getCurrentApp();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            appId,
          }, null, 2),
        },
      ],
    };
  }

  private async launchApp(args: any) {
    await this.ensureConnectionOrThrow();
    const { appId, contentId, params } = args;
    if (!appId) {
      throw new Error("appId is required. Use list_apps to get available app IDs.");
    }
    await tvCommands!.launchApp(appId, contentId, params);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: `Launched ${appId}`,
            appId,
            contentId: contentId || null,
            params: params || null,
          }, null, 2),
        },
      ],
    };
  }

  // Channel Control Tools

  private async channelUp() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.channelUp();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Channel up",
          }, null, 2),
        },
      ],
    };
  }

  private async channelDown() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.channelDown();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Channel down",
          }, null, 2),
        },
      ],
    };
  }

  private async listChannels() {
    await this.ensureConnectionOrThrow();
    const channels = await tvCommands!.getChannelList();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            channels,
          }, null, 2),
        },
      ],
    };
  }

  private async getCurrentChannel() {
    await this.ensureConnectionOrThrow();
    const channel = await tvCommands!.getCurrentChannel();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            channel,
          }, null, 2),
        },
      ],
    };
  }

  private async setChannel(args: any) {
    await this.ensureConnectionOrThrow();
    const { channelId } = args;
    if (!channelId) {
      throw new Error("channelId is required. Use list_channels to get available channel IDs.");
    }
    await tvCommands!.setChannel(channelId);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: `Set to channel ${channelId}`,
          }, null, 2),
        },
      ],
    };
  }

  // Input Control Tools

  private async listInputs() {
    await this.ensureConnectionOrThrow();
    const inputs = await tvCommands!.listInputs();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            inputs,
          }, null, 2),
        },
      ],
    };
  }

  private async setInput(args: any) {
    await this.ensureConnectionOrThrow();
    const { inputId } = args;
    if (!inputId) {
      throw new Error("inputId is required. Use list_inputs to get available input IDs.");
    }
    await tvCommands!.setInput(inputId);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: `Switched to ${inputId}`,
          }, null, 2),
        },
      ],
    };
  }

  // Remote Control Tools

  private async remoteUp() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.pressUp();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            action: "up",
            message: "Pressed UP",
          }, null, 2),
        },
      ],
    };
  }

  private async remoteDown() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.pressDown();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            action: "down",
            message: "Pressed DOWN",
          }, null, 2),
        },
      ],
    };
  }

  private async remoteLeft() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.pressLeft();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            action: "left",
            message: "Pressed LEFT",
          }, null, 2),
        },
      ],
    };
  }

  private async remoteRight() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.pressRight();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            action: "right",
            message: "Pressed RIGHT",
          }, null, 2),
        },
      ],
    };
  }

  private async remoteOk() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.pressOk();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            action: "ok",
            message: "Pressed OK",
          }, null, 2),
        },
      ],
    };
  }

  private async remoteBack() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.pressBack();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            action: "back",
            message: "Pressed BACK",
          }, null, 2),
        },
      ],
    };
  }

  private async remoteHome() {
    await this.ensureConnectionOrThrow();
    await tvCommands!.pressHome();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            action: "home",
            message: "Pressed HOME",
          }, null, 2),
        },
      ],
    };
  }

  // Search Tool

  private async searchContent(args: any) {
    await this.ensureConnectionOrThrow();
    const { query, categories } = args;
    
    if (!query) {
      throw new Error("query parameter is required");
    }

    const result = categories 
      ? await tvCommands!.searchContentAdvanced(query, categories)
      : await tvCommands!.searchContent(query);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  // Helper Methods

  private async ensureConnectionOrThrow() {
    if (!tvCommands) {
      const reconnected = await ensureConnection();
      if (!reconnected) {
        throw new Error("Not connected to TV. Please connect first using connect_tv tool.");
      }
    }
  }

  // ==================== HTTP SERVER ====================

  async runHTTP(port: number = 3333) {
    const app = express();
    app.use(cors());
    app.use(express.json());

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        message: 'Pokemote MCP Server is running',
        connected: !!tvClient,
        currentTV: currentTVIP,
      });
    });

    // MCP JSON-RPC endpoint
    app.post('/mcp', async (req, res) => {
      console.log('MCP POST request received');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      try {
        const request: MCPRequest = req.body;
        console.log('MCP JSON-RPC request:', JSON.stringify(request, null, 2));

        // Handle JSON-RPC requests
        if (request.method === 'initialize') {
          const protocolVersion = request?.params?.protocolVersion || '2024-11-05';
          const responseBody: MCPResponse = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion,
              serverInfo: {
                name: 'pokemote-mcp-server',
                version: '1.0.0',
                description: 'Control LG WebOS Smart TVs - discover, connect, and control TV functions including power, volume, channels, apps, media playback, and remote navigation. Supports PIN-based pairing, credential storage, and auto-reconnect.',
              },
              capabilities: {
                tools: {},
              },
            },
          };
          res.json(responseBody);

        } else if (request.method === 'ping') {
          res.json({
            jsonrpc: '2.0',
            id: request.id,
            result: { ok: true, now: new Date().toISOString() },
          });

        } else if (request.method === 'tools/list') {
          res.json({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              tools: this.getTools(),
            },
          });

        } else if (request.method === 'tools/call') {
          const { name, arguments: args } = request.params;
          
          try {
            const result = await this.executeTool(name, args);
            res.json({
              jsonrpc: '2.0',
              id: request.id,
              result: result,
            });
          } catch (error: any) {
            console.error('Tool execution error:', error);
            res.json({
              jsonrpc: '2.0',
              id: request.id,
              error: {
                code: -32603,
                message: error.message,
              },
            });
          }

        } else {
          res.json({
            jsonrpc: '2.0',
            error: { code: -32601, message: 'Method not found' },
            id: request.id,
          });
        }

      } catch (error: any) {
        console.error('MCP JSON-RPC error:', error);
        res.json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error' },
          id: req.body?.id,
        });
      }
    });

    app.listen(port, () => {
      console.log(`🚀 Pokemote MCP Server running on http://localhost:${port}`);
      console.log(`📡 MCP endpoint: http://localhost:${port}/mcp`);
      console.log(`❤️  Health check: http://localhost:${port}/health`);
      console.log(`📺 TV Status: ${tvClient ? `Connected to ${currentTVIP}` : 'Not connected'}`);
    });
  }
}

