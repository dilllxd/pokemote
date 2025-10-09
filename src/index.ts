import express from "express";
import cors from "cors";
import { discoverTVs } from "./tv/discovery.js";
import { LGTVClient } from "./tv/client.js";
import { TVCommands } from "./tv/commands.js";
import { tvDatabase } from "./tv/database.js";

type Request = express.Request;
type Response = express.Response;

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`<-- ${req.method} ${req.path}`);
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`--> ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Global TV client instance and state tracking by IP
let tvClient: LGTVClient | null = null;
let tvCommands: TVCommands | null = null;
let currentTVIP: string | null = null;

// Track pending pairing state by IP
const pendingPairings = new Map<string, {
  client: LGTVClient;
  secure: boolean;
}>();

// Active subscriptions for SSE clients
const sseClients = new Map<string, Response>();
const activeSubscriptions = new Map<string, string>(); // subscriptionId -> uri

/**
 * Auto-reconnect to TV using stored credentials
 */
async function autoReconnect(ip: string): Promise<boolean> {
  try {
    const credentials = tvDatabase.getCredentials(ip);
    if (!credentials || !credentials.isValid) {
      console.log(`⚠️  No valid credentials found for ${ip}`);
      return false;
    }

    console.log(`🔄 Auto-reconnecting to ${ip}...`);
    
    tvClient = new LGTVClient({
      ip: credentials.ip,
      secure: credentials.secure,
      clientKey: credentials.clientKey,
    });

    await tvClient.connect();
    await tvClient.registerWithStoredKey();
    
    tvCommands = new TVCommands(tvClient);
    currentTVIP = ip;
    
    console.log(`✅ Auto-reconnected to ${ip}`);
    return true;
  } catch (err: any) {
    console.error(`❌ Auto-reconnect failed: ${err.message}`);
    
    // If authentication failed, invalidate credentials
    if (err.message.includes("401") || err.message.includes("authentication")) {
      tvDatabase.invalidateCredentials(ip);
      console.log(`🔑 Credentials expired for ${ip}, please reconnect manually`);
    }
    
    return false;
  }
}

/**
 * Ensure TV connection (auto-reconnect if needed)
 */
async function ensureConnection(): Promise<boolean> {
  if (tvClient && tvCommands) {
    return true;
  }

  // Try to reconnect to most recent TV
  const recentTV = tvDatabase.getMostRecentTV();
  if (recentTV) {
    return await autoReconnect(recentTV.ip);
  }

  return false;
}

/**
 * Middleware to ensure TV connection before handling requests
 */
async function requireConnection(req: Request, res: Response, next: any) {
  if (!tvCommands) {
    const reconnected = await ensureConnection();
    if (!reconnected) {
      return res.status(400).json({ 
        success: false, 
        error: "Not connected to TV. Please connect first using /api/connect" 
      });
    }
  }
  next();
}

// ==================== DISCOVERY & CONNECTION ====================

app.get("/", (req: Request, res: Response) => {
  return res.json({
    name: "LG WebOS TV API",
    version: "1.0.0",
    endpoints: {
      discovery: "GET /api/discover",
      connect: "POST /api/connect",
      disconnect: "POST /api/disconnect",
      status: "GET /api/status",
      volume: {
        up: "POST /api/volume/up",
        down: "POST /api/volume/down",
        set: "POST /api/volume/set",
        get: "GET /api/volume",
        mute: "POST /api/volume/mute",
      },
      media: {
        play: "POST /api/media/play",
        pause: "POST /api/media/pause",
        stop: "POST /api/media/stop",
        rewind: "POST /api/media/rewind",
        fastForward: "POST /api/media/fastforward",
      },
      system: {
        powerOff: "POST /api/system/power-off",
        screenOff: "POST /api/system/screen-off",
        screenOn: "POST /api/system/screen-on",
        info: "GET /api/system/info",
        notify: "POST /api/system/notify",
      },
      apps: {
        list: "GET /api/apps",
        running: "GET /api/apps/running",
        launch: "POST /api/apps/launch",
        current: "GET /api/apps/current",
      },
      channels: {
        up: "POST /api/channels/up",
        down: "POST /api/channels/down",
        list: "GET /api/channels",
        current: "GET /api/channels/current",
        set: "POST /api/channels/set",
      },
      inputs: {
        list: "GET /api/inputs",
        set: "POST /api/inputs/set",
      },
      remote: "POST /api/remote (body: {action: 'up'|'down'|'left'|'right'|'ok'|'back'|'home'})",
      pairing: {
        connect: "POST /api/connect (body: {ip, secure?}) - Displays PIN on TV",
        pair: "POST /api/pair (body: {pin}) - Completes pairing with PIN",
      },
      credentials: {
        list: "GET /api/credentials",
        delete: "DELETE /api/credentials/:ip",
        reconnect: "POST /api/reconnect",
      },
      subscriptions: {
        volume: "GET /api/subscribe/volume",
        channel: "GET /api/subscribe/channel",
        app: "GET /api/subscribe/app",
        all: "GET /api/subscribe/all",
        list: "GET /api/subscriptions",
      },
    },
  });
});

app.get("/api/discover", async (req: Request, res: Response) => {
  try {
    console.log("🔍 Discovering TVs on network...");
    const tvs = await discoverTVs(5000);
    
    return res.json({
      success: true,
      count: tvs.length,
      tvs,
      message: tvs.length > 0 
        ? `Found ${tvs.length} TV(s)` 
        : "No TVs found. Make sure TV is on and on same network.",
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/connect", async (req: Request, res: Response) => {
  try {
    const body = await req.body;
    const { ip, secure, force = false } = body;

    if (!ip) {
      return res.status(400).json({ success: false, error: "IP address required" });
    }

    // Check if already connected to this IP
    if (tvClient && currentTVIP === ip && !force) {
      return res.json({ 
        success: true, 
        message: "Already connected",
        ip: currentTVIP,
        clientKey: tvClient.clientKey 
      });
    }

    // Disconnect existing connection
    if (tvClient) {
      tvClient.disconnect();
      tvClient = null;
      tvCommands = null;
    }

    // Try to load saved credentials from database
    const stored = tvDatabase.getCredentials(ip);
    const clientKey = stored?.isValid ? stored.clientKey : undefined;

    // Auto-detect secure mode if not specified
    let useSecure = secure !== undefined ? secure : (stored?.secure ?? true);
    let connectionError: Error | null = null;

    // Try secure connection first, then fall back to non-secure
    const modes = secure !== undefined ? [useSecure] : [true, false];
    
    for (const trySecure of modes) {
      try {
        console.log(`🔌 Connecting to TV at ${ip}:${trySecure ? 3001 : 3000} (${trySecure ? 'secure' : 'non-secure'})...`);
        tvClient = new LGTVClient({ ip, secure: trySecure, clientKey });
        await tvClient.connect();
        useSecure = trySecure;
        connectionError = null;
        break; // Connection successful
      } catch (err: any) {
        console.log(`❌ ${trySecure ? 'Secure' : 'Non-secure'} connection failed: ${err.message}`);
        connectionError = err;
        tvClient = null;
        
        // If user explicitly specified secure mode, don't try fallback
        if (secure !== undefined) {
          throw err;
        }
      }
    }

    if (!tvClient || connectionError) {
      throw new Error(`Failed to connect to TV. Tried both secure and non-secure modes. Last error: ${connectionError?.message}`);
    }

    // Initiate PIN-based pairing
    const result = await tvClient.initiateRegistration();
    
    if (result.requiresPIN) {
      pendingPairings.set(ip, {
        client: tvClient,
        secure: useSecure,
      });
      currentTVIP = ip;
      
      return res.json({
        success: true,
        message: "PIN displayed on TV. Enter PIN using /api/pair endpoint.",
        ip,
        secure: useSecure,
        requiresPIN: true,
        nextStep: "POST /api/pair with {pin: 'PIN_FROM_TV'}",
      });
    }

    // Fallback for non-PIN pairing (PROMPT mode)
    const newClientKey = tvClient.clientKey;
    if (newClientKey) {
      tvDatabase.saveCredentials(ip, newClientKey, useSecure);
      tvCommands = new TVCommands(tvClient);
      currentTVIP = ip;
      
      return res.json({
        success: true,
        message: "Connected and authenticated",
        ip,
        secure: useSecure,
        clientKey: newClientKey,
      });
    }

    throw new Error("Registration failed");
  } catch (err: any) {
    tvClient = null;
    tvCommands = null;
    currentTVIP = null;
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/pair", async (req: Request, res: Response) => {
  try {
    const { pin, ip } = await req.body;

    if (!pin) {
      return res.status(400).json({ 
        success: false, 
        error: "PIN is required",
        example: '{"pin": "123456"}'
      });
    }

    const targetIP = ip || currentTVIP;
    
    if (!targetIP) {
      return res.status(400).json({ 
        success: false, 
        error: "No active pairing session. Call /api/connect first."
      });
    }

    const pending = pendingPairings.get(targetIP);
    
    if (!pending) {
      return res.status(400).json({ 
        success: false, 
        error: `No pending pairing for ${targetIP}. Call /api/connect first.`
      });
    }

    const clientKey = await pending.client.completePairing(pin);

    tvDatabase.saveCredentials(targetIP, clientKey, pending.secure);
    tvClient = pending.client;
    tvCommands = new TVCommands(tvClient);
    currentTVIP = targetIP;
    pendingPairings.delete(targetIP);

    return res.json({
      success: true,
      message: "Successfully paired with TV",
      ip: targetIP,
      clientKey,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/disconnect", (req: Request, res: Response) => {
  if (tvClient) {
    tvClient.disconnect();
    tvClient = null;
    tvCommands = null;
    currentTVIP = null;
  }
  
  // Clear any pending pairings
  pendingPairings.clear();
  
  return res.json({ success: true, message: "Disconnected" });
});

app.get("/api/status", async (req: Request, res: Response) => {
  const connected = !!tvClient;
  const authenticated = !!tvClient?.clientKey;
  
  // Try auto-reconnect if not connected
  if (!connected) {
    const reconnected = await ensureConnection();
    if (reconnected) {
      return res.json({
        connected: true,
        authenticated: true,
        ip: currentTVIP,
        autoReconnected: true,
        message: "Auto-reconnected using stored credentials",
      });
    }
  }
  
  return res.json({
    connected,
    authenticated,
    ip: currentTVIP,
    storedTVs: tvDatabase.getAllCredentials().length,
  });
});

/**
 * GET /api/credentials - List all stored TV credentials
 */
app.get("/api/credentials", (req: Request, res: Response) => {
  const credentials = tvDatabase.getAllCredentials();
  return res.json({
    success: true,
    count: credentials.length,
    credentials: credentials.map(c => ({
      ip: c.ip,
      secure: c.secure,
      isValid: c.isValid,
      createdAt: c.createdAt,
      lastUsed: c.lastUsed,
    })),
  });
});

/**
 * DELETE /api/credentials/:ip - Delete stored credentials for a TV
 */
app.delete("/api/credentials/:ip", (req: Request, res: Response) => {
  const { ip } = req.params;
  tvDatabase.deleteCredentials(ip);
  return res.json({
    success: true,
    message: `Deleted credentials for ${ip}`,
  });
});

/**
 * POST /api/reconnect - Reconnect to most recent TV or specific IP
 */
app.post("/api/reconnect", async (req: Request, res: Response) => {
  try {
    const { ip } = await req.body;
    
    // If already connected, return success
    if (tvClient && (!ip || currentTVIP === ip)) {
      return res.json({
        success: true,
        message: "Already connected",
        ip: currentTVIP,
      });
    }
    
    // Disconnect current connection
    if (tvClient) {
      tvClient.disconnect();
      tvClient = null;
      tvCommands = null;
      currentTVIP = null;
    }
    
    // Reconnect to specified IP or most recent
    const targetIP = ip || tvDatabase.getMostRecentTV()?.ip;
    if (!targetIP) {
      return res.status(400).json({
        success: false,
        error: "No IP specified and no stored credentials found",
      });
    }
    
    const reconnected = await autoReconnect(targetIP);
    if (!reconnected) {
      return res.status(500).json({
        success: false,
        error: "Failed to reconnect. Credentials may be expired.",
      });
    }
    
    return res.json({
      success: true,
      message: "Reconnected successfully",
      ip: currentTVIP,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== VOLUME CONTROLS ====================

app.post("/api/volume/up", requireConnection, async (req: Request, res: Response) => {
  try {
    await tvCommands!.volumeUp();
    return res.json({ success: true, message: "Volume increased" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/volume/down", requireConnection, async (req: Request, res: Response) => {
  try {
    await tvCommands!.volumeDown();
    return res.json({ success: true, message: "Volume decreased" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/volume/set", requireConnection, async (req: Request, res: Response) => {
  try {
    const { volume } = await req.body;
    if (volume === undefined || volume < 0 || volume > 100) {
      return res.status(400).json({ success: false, error: "Volume must be 0-100" });
    }
    await tvCommands!.setVolume(volume);
    return res.json({ success: true, message: `Volume set to ${volume}` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/volume", requireConnection, async (req: Request, res: Response) => {
  try {
    const volume = await tvCommands!.getVolume();
    return res.json({ success: true, volume });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/volume/mute", requireConnection, async (req: Request, res: Response) => {
  try {
    const { mute } = await req.body;
    await tvCommands!.mute(mute);
    return res.json({ success: true, message: mute ? "Muted" : "Unmuted" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== MEDIA CONTROLS ====================

app.post("/api/media/play", requireConnection, async (req: Request, res: Response) => {
  try {
    await tvCommands!.play();
    return res.json({ success: true, message: "Playing" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/media/pause", requireConnection, async (req: Request, res: Response) => {
  try {
    await tvCommands!.pause();
    return res.json({ success: true, message: "Paused" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/media/stop", requireConnection, async (req: Request, res: Response) => {
  try {
    await tvCommands!.stop();
    return res.json({ success: true, message: "Stopped" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/media/rewind", requireConnection, async (req: Request, res: Response) => {
  try {
    await tvCommands!.rewind();
    return res.json({ success: true, message: "Rewinding" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/media/fastforward", requireConnection, async (req: Request, res: Response) => {
  try {
    await tvCommands!.fastForward();
    return res.json({ success: true, message: "Fast forwarding" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== SYSTEM CONTROLS ====================

app.post("/api/system/power-off", requireConnection, async (req: Request, res: Response) => {
  try {
    await tvCommands!.powerOff();
    return res.json({ success: true, message: "TV powering off" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/system/screen-off", requireConnection, async (req: Request, res: Response) => {
  try {
    await tvCommands!.screenOff();
    return res.json({ success: true, message: "Screen off" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/system/screen-on", requireConnection, async (req: Request, res: Response) => {
  try {
    await tvCommands!.screenOn();
    return res.json({ success: true, message: "Screen on" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/system/info", requireConnection, async (req: Request, res: Response) => {
  try {
    const info = await tvCommands!.getSystemInfo();
    return res.json({ success: true, info });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/system/notify", requireConnection, async (req: Request, res: Response) => {
  try {
    const { message } = await req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: "Message required" });
    }
    await tvCommands!.notify(message);
    return res.json({ success: true, message: "Notification sent" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== APP CONTROLS ====================

app.get("/api/apps", requireConnection, async (req: Request, res: Response) => {
  try {
    const apps = await tvCommands!.listApps();
    return res.json({ success: true, apps });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/apps/launch", requireConnection, async (req: Request, res: Response) => {
  try {
    const { appId, contentId, params } = await req.body;
    if (!appId) {
      return res.status(400).json({ success: false, error: "appId required" });
    }
    await tvCommands!.launchApp(appId, contentId, params);
    return res.json({ success: true, message: `Launched ${appId}` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/apps/current", requireConnection, async (req: Request, res: Response) => {
  try {
    const appId = await tvCommands!.getCurrentApp();
    return res.json({ success: true, appId });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/apps/running", requireConnection, async (req: Request, res: Response) => {
  try {
    const apps = await tvCommands!.listRunningApps();
    return res.json({ success: true, apps });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== CHANNEL CONTROLS ====================

app.post("/api/channels/up", requireConnection, async (req: Request, res: Response) => {
  try {
    await tvCommands!.channelUp();
    return res.json({ success: true, message: "Channel up" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/channels/down", requireConnection, async (req: Request, res: Response) => {
  try {
    await tvCommands!.channelDown();
    return res.json({ success: true, message: "Channel down" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/channels", requireConnection, async (req: Request, res: Response) => {
  try {
    const channels = await tvCommands!.getChannelList();
    return res.json({ success: true, channels });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/channels/current", requireConnection, async (req: Request, res: Response) => {
  try {
    const channel = await tvCommands!.getCurrentChannel();
    return res.json({ success: true, channel });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/channels/set", requireConnection, async (req: Request, res: Response) => {
  try {
    const { channelId } = await req.body;
    if (!channelId) {
      return res.status(400).json({ success: false, error: "channelId required" });
    }
    await tvCommands!.setChannel(channelId);
    return res.json({ success: true, message: `Set to channel ${channelId}` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== INPUT CONTROLS ====================

app.get("/api/inputs", requireConnection, async (req: Request, res: Response) => {
  try {
    const inputs = await tvCommands!.listInputs();
    return res.json({ success: true, inputs });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/inputs/set", requireConnection, async (req: Request, res: Response) => {
  try {
    const { inputId } = await req.body;
    if (!inputId) {
      return res.status(400).json({ success: false, error: "inputId required" });
    }
    await tvCommands!.setInput(inputId);
    return res.json({ success: true, message: `Switched to ${inputId}` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== REMOTE NAVIGATION ====================

app.post("/api/remote", requireConnection, async (req: Request, res: Response) => {
  try {
    const { action } = await req.body;
    
    if (!action) {
      return res.status(400).json({ 
        success: false, 
        error: "action is required",
        validActions: ["up", "down", "left", "right", "ok", "back", "home"]
      });
    }

    const actionMap: Record<string, () => Promise<any>> = {
      up: () => tvCommands!.pressUp(),
      down: () => tvCommands!.pressDown(),
      left: () => tvCommands!.pressLeft(),
      right: () => tvCommands!.pressRight(),
      ok: () => tvCommands!.pressOk(),
      back: () => tvCommands!.pressBack(),
      home: () => tvCommands!.pressHome(),
    };

    const handler = actionMap[action.toLowerCase()];
    
    if (!handler) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid action: ${action}`,
        validActions: ["up", "down", "left", "right", "ok", "back", "home"]
      });
    }

    await handler();
    return res.json({ success: true, action, message: `Remote ${action}` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== REAL-TIME SUBSCRIPTIONS (SSE) ====================

/**
 * GET /api/subscribe/volume - Subscribe to volume changes via Server-Sent Events
 */
app.get("/api/subscribe/volume", async (req: Request, res: Response) => {
  try {
    if (!tvClient) {
      return res.status(400).json({ success: false, error: "Not connected to TV" });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Math.random().toString(36).substring(7);
    sseClients.set(clientId, res);

    // Subscribe to volume changes
    const subscriptionId = await tvClient.subscribe('ssap://audio/getVolume', (data) => {
      const event = {
        type: 'volume',
        volume: data.volume,
        muted: data.muted,
        changed: data.changed || [],
        timestamp: new Date().toISOString()
      };
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    activeSubscriptions.set(subscriptionId, 'ssap://audio/getVolume');
    console.log(`📡 Client ${clientId} subscribed to volume changes`);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', subscription: 'volume' })}\n\n`);

    // Clean up on disconnect
    req.on('close', () => {
      sseClients.delete(clientId);
      if (tvClient && subscriptionId) {
        tvClient.unsubscribe(subscriptionId, 'ssap://audio/getVolume');
        activeSubscriptions.delete(subscriptionId);
      }
      console.log(`📡 Client ${clientId} disconnected from volume subscription`);
    });

  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/subscribe/channel - Subscribe to channel changes via Server-Sent Events
 */
app.get("/api/subscribe/channel", async (req: Request, res: Response) => {
  try {
    if (!tvClient) {
      return res.status(400).json({ success: false, error: "Not connected to TV" });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Math.random().toString(36).substring(7);
    sseClients.set(clientId, res);

    const subscriptionId = await tvClient.subscribe('ssap://tv/getCurrentChannel', (data) => {
      const event = {
        type: 'channel',
        channelId: data.channelId,
        channelName: data.channelName,
        channelNumber: data.channelNumber,
        timestamp: new Date().toISOString()
      };
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    activeSubscriptions.set(subscriptionId, 'ssap://tv/getCurrentChannel');
    console.log(`📡 Client ${clientId} subscribed to channel changes`);

    res.write(`data: ${JSON.stringify({ type: 'connected', subscription: 'channel' })}\n\n`);

    req.on('close', () => {
      sseClients.delete(clientId);
      if (tvClient && subscriptionId) {
        tvClient.unsubscribe(subscriptionId, 'ssap://tv/getCurrentChannel');
        activeSubscriptions.delete(subscriptionId);
      }
      console.log(`📡 Client ${clientId} disconnected from channel subscription`);
    });

  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/subscribe/app - Subscribe to app changes via Server-Sent Events
 */
app.get("/api/subscribe/app", async (req: Request, res: Response) => {
  try {
    if (!tvClient) {
      return res.status(400).json({ success: false, error: "Not connected to TV" });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Math.random().toString(36).substring(7);
    sseClients.set(clientId, res);

    const subscriptionId = await tvClient.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', (data) => {
      const event = {
        type: 'app',
        appId: data.appId,
        appName: data.appName || data.title,
        windowId: data.windowId,
        timestamp: new Date().toISOString()
      };
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    activeSubscriptions.set(subscriptionId, 'ssap://com.webos.applicationManager/getForegroundAppInfo');
    console.log(`📡 Client ${clientId} subscribed to app changes`);

    res.write(`data: ${JSON.stringify({ type: 'connected', subscription: 'app' })}\n\n`);

    req.on('close', () => {
      sseClients.delete(clientId);
      if (tvClient && subscriptionId) {
        tvClient.unsubscribe(subscriptionId, 'ssap://com.webos.applicationManager/getForegroundAppInfo');
        activeSubscriptions.delete(subscriptionId);
      }
      console.log(`📡 Client ${clientId} disconnected from app subscription`);
    });

  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/subscribe/all - Subscribe to all events via Server-Sent Events
 */
app.get("/api/subscribe/all", async (req: Request, res: Response) => {
  try {
    if (!tvClient) {
      return res.status(400).json({ success: false, error: "Not connected to TV" });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Math.random().toString(36).substring(7);
    sseClients.set(clientId, res);

    const subscriptions: { id: string; uri: string }[] = [];

    // Subscribe to volume
    const volumeId = await tvClient.subscribe('ssap://audio/getVolume', (data) => {
      res.write(`data: ${JSON.stringify({ type: 'volume', ...data, timestamp: new Date().toISOString() })}\n\n`);
    });
    subscriptions.push({ id: volumeId, uri: 'ssap://audio/getVolume' });

    // Subscribe to channel
    const channelId = await tvClient.subscribe('ssap://tv/getCurrentChannel', (data) => {
      res.write(`data: ${JSON.stringify({ type: 'channel', ...data, timestamp: new Date().toISOString() })}\n\n`);
    });
    subscriptions.push({ id: channelId, uri: 'ssap://tv/getCurrentChannel' });

    // Subscribe to app
    const appId = await tvClient.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', (data) => {
      res.write(`data: ${JSON.stringify({ type: 'app', ...data, timestamp: new Date().toISOString() })}\n\n`);
    });
    subscriptions.push({ id: appId, uri: 'ssap://com.webos.applicationManager/getForegroundAppInfo' });

    console.log(`📡 Client ${clientId} subscribed to ALL events`);
    res.write(`data: ${JSON.stringify({ type: 'connected', subscription: 'all', subscriptions: subscriptions.length })}\n\n`);

    req.on('close', () => {
      sseClients.delete(clientId);
      if (tvClient) {
        subscriptions.forEach(({ id, uri }) => {
          tvClient!.unsubscribe(id, uri);
          activeSubscriptions.delete(id);
        });
      }
      console.log(`📡 Client ${clientId} disconnected from ALL subscriptions`);
    });

  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/subscriptions - List active subscriptions
 */
app.get("/api/subscriptions", (req: Request, res: Response) => {
  const subscriptions = Array.from(activeSubscriptions.entries()).map(([id, uri]) => ({
    subscriptionId: id,
    uri,
  }));

  return res.json({
    success: true,
    activeClients: sseClients.size,
    subscriptions,
  });
});

// Start server
const port = process.env.PORT || 3000;
console.log(`🚀 LG WebOS TV API Server starting on port ${port}...`);

app.listen(port, () => {
  console.log(`Started development server: http://localhost:${port}`);
});

