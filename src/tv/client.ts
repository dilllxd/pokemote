import { randomUUID } from "crypto";
import WebSocket from "ws";
import https from "https";

export interface TVClientConfig {
  ip: string;
  secure?: boolean;
  clientKey?: string;
}

export interface TVMessage {
  type: "register" | "request" | "subscribe" | "unsubscribe" | "response" | "registered" | "error";
  id: string;
  uri?: string;
  payload?: any;
  error?: string;
}

// Registration manifest from Python implementation
const REGISTRATION_MANIFEST = {
  forcePairing: false,
  pairingType: "PIN",
  manifest: {
    manifestVersion: 1,
    appVersion: "1.1",
    signed: {
      created: "20140509",
      appId: "com.lge.test",
      vendorId: "com.lge",
      localizedAppNames: {
        "": "LG Remote App",
        "en-US": "LG Remote App",
        "en-GB": "LG Remote App",
        "en-IN": "LG Remote App"
      },
      localizedVendorNames: {
        "": "LG Electronics",
        "en-US": "LG Electronics",
        "en-GB": "LG Electronics"
      },
      permissions: [
        "TEST_SECURE",
        "CONTROL_INPUT_TEXT",
        "CONTROL_MOUSE_AND_KEYBOARD",
        "CONTROL_INPUT_POINTER",
        "READ_INSTALLED_APPS",
        "READ_LGE_SDX",
        "READ_NOTIFICATIONS",
        "SEARCH",
        "WRITE_SETTINGS",
        "WRITE_NOTIFICATION_ALERT",
        "CONTROL_POWER",
        "READ_CURRENT_CHANNEL",
        "READ_RUNNING_APPS",
        "READ_UPDATE_INFO",
        "UPDATE_FROM_REMOTE_APP",
        "READ_LGE_TV_INPUT_EVENTS",
        "READ_TV_CURRENT_TIME",
      ],
      serial: "2f930e2d2cfe083771f68e4fe7bb07",
    },
    permissions: [
      "LAUNCH",
      "LAUNCH_WEBAPP",
      "APP_TO_APP",
      "CLOSE",
      "TEST_OPEN",
      "TEST_PROTECTED",
      "CONTROL_AUDIO",
      "CONTROL_DISPLAY",
      "CONTROL_INPUT_JOYSTICK",
      "CONTROL_INPUT_MEDIA_RECORDING",
      "CONTROL_INPUT_MEDIA_PLAYBACK",
      "CONTROL_INPUT_TV",
      "CONTROL_INPUT_TEXT",
      "CONTROL_MOUSE_AND_KEYBOARD",
      "CONTROL_POWER",
      "READ_APP_STATUS",
      "READ_CURRENT_CHANNEL",
      "READ_INPUT_DEVICE_LIST",
      "READ_NETWORK_STATE",
      "READ_RUNNING_APPS",
      "READ_INSTALLED_APPS",
      "READ_TV_CHANNEL_LIST",
      "WRITE_NOTIFICATION_TOAST",
      "READ_POWER_STATE",
      "READ_COUNTRY_INFO",
      "READ_SETTINGS",
      "CONTROL_TV_SCREEN",
      "CONTROL_TV_STANBY",
      "CONTROL_FAVORITE_GROUP",
      "CONTROL_USER_INFO",
      "CHECK_BLUETOOTH_DEVICE",
      "CONTROL_BLUETOOTH",
      "CONTROL_TIMER_INFO",
      "STB_INTERNAL_CONNECTION",
      "CONTROL_RECORDING",
      "READ_RECORDING_STATE",
      "WRITE_RECORDING_LIST",
      "READ_RECORDING_LIST",
      "READ_RECORDING_SCHEDULE",
      "WRITE_RECORDING_SCHEDULE",
      "READ_STORAGE_DEVICE_LIST",
      "READ_TV_PROGRAM_INFO",
      "CONTROL_BOX_CHANNEL",
      "READ_TV_ACR_AUTH_TOKEN",
      "READ_TV_CONTENT_STATE",
      "READ_TV_CURRENT_TIME",
      "ADD_LAUNCHER_CHANNEL",
      "SET_CHANNEL_SKIP",
      "RELEASE_CHANNEL_SKIP",
      "CONTROL_CHANNEL_BLOCK",
      "DELETE_SELECT_CHANNEL",
      "CONTROL_CHANNEL_GROUP",
      "SCAN_TV_CHANNELS",
      "CONTROL_TV_POWER",
      "CONTROL_WOL",
    ],
    signatures: [
      {
        signatureVersion: 1,
        signature:
          "eyJhbGdvcml0aG0iOiJSU0EtU0hBMjU2Iiwia2V5SWQiOiJ0ZXN0LXNpZ25pbmctY2VydCIsInNpZ25hdHVyZVZlcnNpb24iOjF9.hrVRgjCwXVvE2OOSpDZ58hR+59aFNwYDyjQgKk3auukd7pcegmE2CzPCa0bJ0ZsRAcKkCTJrWo5iDzNhMBWRyaMOv5zWSrthlf7G128qvIlpMT0YNY+n/FaOHE73uLrS/g7swl3/qH/BGFG2Hu4RlL48eb3lLKqTt2xKHdCs6Cd4RMfJPYnzgvI4BNrFUKsjkcu+WD4OO2A27Pq1n50cMchmcaXadJhGrOqH5YmHdOCj5NSHzJYrsW0HPlpuAx/ECMeIZYDh6RMqaFM2DXzdKX9NmmyqzJ3o/0lkk/N97gfVRLW5hA29yeAwaCViZNCP8iC9aO0q9fQojoa7NQnAtw==",
      },
    ],
  },
};

export class LGTVClient {
  private ws: any = null;
  private config: TVClientConfig;
  private pendingRequests = new Map<string, (response: TVMessage) => void>();
  private subscriptions = new Map<string, (data: any) => void>();
  public clientKey: string | null = null;
  private pointerSocket: any = null;
  private pointerSocketPath: string | null = null;
  private pendingRegistrationId: string | null = null;

  constructor(config: TVClientConfig) {
    this.config = config;
    this.clientKey = config.clientKey || null;
  }

  /**
   * Connect to the TV
   */
  async connect(): Promise<void> {
    // LG TVs can use different ports depending on model/firmware
    // Common ports: 3000, 3001 (standard)
    const port = this.config.secure ? 3001 : 3000;
    const protocol = this.config.secure ? "wss" : "ws";
    const url = `${protocol}://${this.config.ip}:${port}/`;

    return new Promise((resolve, reject) => {
      try {
        // Use ws package with proper TLS options for secure connections
        const wsOptions: any = {};
        
        if (this.config.secure) {
          // For secure connections, accept self-signed certificates
          wsOptions.agent = new https.Agent({
            rejectUnauthorized: false,
          });
        }

        this.ws = new WebSocket(url, wsOptions);
        
        let connected = false;
        let connectTimeout: any;

        connectTimeout = setTimeout(() => {
          if (!connected) {
            this.ws?.close();
            reject(new Error("Connection timeout after 10 seconds"));
          }
        }, 10000);

        this.ws.on('open', () => {
          connected = true;
          clearTimeout(connectTimeout);
          console.log(`✅ Connected to TV at ${url}`);
          resolve();
        });

        this.ws.on('error', (err: Error) => {
          clearTimeout(connectTimeout);
          console.error("❌ WebSocket error:", err.message);
          if (!connected) {
            reject(new Error(`Failed to connect to ${url}: ${err.message}`));
          }
        });

        this.ws.on('message', (data: Buffer) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          clearTimeout(connectTimeout);
          if (!connected) {
            reject(new Error(`Connection closed before handshake. Code: ${code}, Reason: ${reason.toString() || 'Unknown'}`));
          } else {
            console.log("TV connection closed");
          }
        });
      } catch (err: any) {
        reject(new Error(`WebSocket creation failed: ${err.message}`));
      }
    });
  }

  /**
   * Initiate registration with PIN pairing
   * This displays a PIN on the TV screen that must be entered via completePairing()
   * @returns Promise that resolves when PIN is displayed on TV
   */
  async initiateRegistration(): Promise<{ requiresPIN: boolean }> {
    if (!this.ws) throw new Error("Not connected");

    const payload: any = { ...REGISTRATION_MANIFEST };
    
    if (this.clientKey) {
      payload["client-key"] = this.clientKey;
    }
    
    const message = {
      type: "register",
      id: randomUUID(),
      payload,
    };

    this.pendingRegistrationId = message.id;

    return new Promise((resolve, reject) => {
      const checkResponse = (msg: TVMessage) => {
        if (msg.type === "response" && msg.payload?.pairingType === "PIN") {
          console.log("🔑 PIN displayed on TV");
          resolve({ requiresPIN: true });
          // Keep handler active to receive "registered" message after PIN entry
        } else if (msg.type === "response" && msg.payload?.pairingType === "PROMPT") {
          console.log("⚠️  Please accept the pairing request on your TV");
        } else if (msg.type === "registered") {
          this.clientKey = msg.payload["client-key"];
          this.pendingRequests.delete(message.id);
          this.pendingRegistrationId = null;
          console.log("✅ Successfully paired with TV");
        } else if (msg.type === "error") {
          this.pendingRequests.delete(message.id);
          this.pendingRegistrationId = null;
          reject(new Error(msg.error || "Registration failed"));
        }
      };

      this.pendingRequests.set(message.id, checkResponse);
      this.send(message);

      setTimeout(() => {
        if (this.pendingRequests.has(message.id) && !this.clientKey) {
          this.pendingRequests.delete(message.id);
          this.pendingRegistrationId = null;
          reject(new Error("Registration timeout"));
        }
      }, 60000);
    });
  }

  /**
   * Complete pairing by submitting the PIN displayed on TV
   * Uses ssap://pairing/setPin to verify the PIN and receive client-key
   * @param pin - The PIN code displayed on the TV screen
   * @returns Promise that resolves with the client-key when pairing is complete
   */
  async completePairing(pin: string): Promise<string> {
    if (!this.ws) throw new Error("Not connected");
    if (!this.pendingRegistrationId) {
      throw new Error("No pending registration. Call initiateRegistration() first.");
    }

    console.log(`🔑 Submitting PIN: ${pin}`);
    
    const message = {
      type: "request",
      id: randomUUID(),
      uri: "ssap://pairing/setPin",
      payload: {
        "pin": pin
      },
    };

    this.send(message);
    
    // Wait for the registration handler to receive "registered" message
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (!this.pendingRegistrationId) {
          clearInterval(checkInterval);
          if (this.clientKey) {
            resolve(this.clientKey);
          } else {
            reject(new Error("Pairing failed"));
          }
        }
      }, 100);
      
      setTimeout(() => {
        clearInterval(checkInterval);
        if (this.pendingRegistrationId) {
          reject(new Error("PIN entry timeout"));
        }
      }, 30000);
    });
  }

  /**
   * Register with TV using stored client-key (for reconnection)
   * Sends registration manifest with permissions even when we have a client-key
   * @returns Promise that resolves with the client-key when authenticated
   */
  async registerWithStoredKey(): Promise<string> {
    if (!this.ws) throw new Error("Not connected");
    if (!this.clientKey) throw new Error("No client-key available");

    console.log("🔐 Authenticating with stored client-key...");

    const payload: any = { ...REGISTRATION_MANIFEST };
    payload["client-key"] = this.clientKey;
    
    const message = {
      type: "register",
      id: randomUUID(),
      payload,
    };

    return new Promise((resolve, reject) => {
      const checkResponse = (msg: TVMessage) => {
        if (msg.type === "registered") {
          console.log("✅ Authenticated with stored credentials");
          this.pendingRequests.delete(message.id);
          resolve(this.clientKey || "");
        } else if (msg.type === "error") {
          this.pendingRequests.delete(message.id);
          reject(new Error(msg.error || "Authentication failed"));
        }
      };

      this.pendingRequests.set(message.id, checkResponse);
      this.send(message);

      setTimeout(() => {
        if (this.pendingRequests.has(message.id)) {
          this.pendingRequests.delete(message.id);
          reject(new Error("Authentication timeout"));
        }
      }, 10000);
    });
  }

  /**
   * Register/authenticate with the TV (legacy method for backward compatibility)
   * @param pin - Optional 6-digit PIN code shown on TV screen
   */
  async register(pin?: string): Promise<string> {
    if (pin) {
      return this.completePairing(pin);
    }
    
    // If we have a client-key, just authenticate with it
    if (this.clientKey) {
      return this.registerWithStoredKey();
    }
    
    const result = await this.initiateRegistration();
    if (result.requiresPIN) {
      throw new Error("PIN required. Use completePairing() or call /api/pair endpoint.");
    }
    
    // If no PIN required, should have been registered already
    return this.clientKey || "";
  }

  /**
   * Send a request to the TV
   */
  async request(uri: string, payload?: any): Promise<any> {
    if (!this.ws) throw new Error("Not connected");

    const message: TVMessage = {
      type: "request",
      id: randomUUID(),
      uri,
      payload: payload || {},
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(message.id, (response: TVMessage) => {
        this.pendingRequests.delete(message.id);

        if (response.type === "error") {
          reject(new Error(response.error || "Request failed"));
        } else if (response.payload?.returnValue === false) {
          reject(new Error(response.payload?.errorText || "Command failed"));
        } else {
          resolve(response.payload);
        }
      });

      this.send(message);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(message.id)) {
          this.pendingRequests.delete(message.id);
          reject(new Error("Request timeout"));
        }
      }, 10000);
    });
  }

  /**
   * Call Luna Service API using the createAlert hack
   * This exploits the alert dialog's onClick/onclose handlers to trigger Luna services
   */
  async callLunaService(uri: string, params: any): Promise<any> {
    if (!this.ws) throw new Error("Not connected");

    console.log(`🌙 Calling Luna service: ${uri}`);

    // Step 1: Create alert with Luna service call in onclose
    const alertPayload = {
      message: "Processing...",
      buttons: [{
        label: "OK",
        onClick: uri,
        params: params
      }],
      onclose: {
        uri: uri,
        params: params
      }
    };

    const alertResponse = await this.request("ssap://system.notifications/createAlert", alertPayload);
    const alertId = alertResponse.alertId;

    if (!alertId) {
      throw new Error("Failed to create alert for Luna service call");
    }

    // Step 2: Immediately close the alert to trigger the onclose handler
    await this.request("ssap://system.notifications/closeAlert", { alertId });

    console.log(`✅ Luna service triggered: ${uri}`);
    
    // Note: Luna service results are not directly returned
    // The TV executes the service internally
    return { success: true, triggered: uri };
  }

  /**
   * Subscribe to real-time events
   */
  async subscribe(uri: string, callback: (data: any) => void): Promise<string> {
    if (!this.ws) throw new Error("Not connected");

    const subscriptionId = randomUUID();
    this.subscriptions.set(subscriptionId, callback);

    const message: TVMessage = {
      type: "subscribe",
      id: subscriptionId,
      uri,
    };

    this.send(message);
    return subscriptionId;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string, uri: string): void {
    this.subscriptions.delete(subscriptionId);
    
    const message: TVMessage = {
      type: "unsubscribe",
      id: subscriptionId,
      uri,
    };

    this.send(message);
  }

  /**
   * Get pointer input socket for remote control buttons
   */
  async getPointerInputSocket(): Promise<string> {
    if (this.pointerSocketPath && this.pointerSocket) {
      return this.pointerSocketPath;
    }

    const response = await this.request("ssap://com.webos.service.networkinput/getPointerInputSocket");
    
    if (!response.socketPath) {
      throw new Error("No pointer socket path returned");
    }

    this.pointerSocketPath = response.socketPath;
    
    // Connect to pointer input socket
    const wsOptions: any = {};
    if (this.config.secure) {
      wsOptions.agent = new https.Agent({
        rejectUnauthorized: false,
      });
    }

    return new Promise((resolve, reject) => {
      this.pointerSocket = new WebSocket(response.socketPath, wsOptions);
      
      this.pointerSocket.on('open', () => {
        console.log("✅ Pointer input socket connected");
        resolve(response.socketPath);
      });

      this.pointerSocket.on('error', (err: Error) => {
        console.error("❌ Pointer socket error:", err.message);
        reject(err);
      });

      this.pointerSocket.on('close', () => {
        console.log("Pointer socket closed");
        this.pointerSocket = null;
        this.pointerSocketPath = null;
      });
    });
  }

  /**
   * Send button press through pointer input socket
   */
  async sendButton(button: string): Promise<void> {
    await this.getPointerInputSocket();
    
    if (!this.pointerSocket || this.pointerSocket.readyState !== WebSocket.OPEN) {
      throw new Error("Pointer socket not connected");
    }

    // Button message format for webOS
    const message = `type:button\nname:${button}\n\n`;
    this.pointerSocket.send(message);
    console.log(`📤 Button pressed: ${button}`);
  }

  /**
   * Close connection
   */
  disconnect(): void {
    if (this.pointerSocket) {
      this.pointerSocket.close();
      this.pointerSocket = null;
      this.pointerSocketPath = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send message to TV
   */
  private send(message: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected");
    }
    const msg = JSON.stringify(message);
    console.log("📤 Sending to TV:", msg);
    this.ws.send(msg);
  }

  /**
   * Handle incoming messages from TV
   */
  private handleMessage(data: string): void {
    try {
      const message: TVMessage = JSON.parse(data);
      console.log(data)
      console.log("📩 TV Message:", JSON.stringify(message));

      // Check if this is a response to a pending request
      if (message.id && this.pendingRequests.has(message.id)) {
        const handler = this.pendingRequests.get(message.id);
        if (handler) handler(message);
        return;
      }

      // Check if this is a subscription update
      if (message.id && this.subscriptions.has(message.id)) {
        const callback = this.subscriptions.get(message.id);
        if (callback) callback(message.payload);
        return;
      }

      console.log("⚠️  Unhandled message:", message);
    } catch (err) {
      console.error("❌ Failed to parse message:", err);
    }
  }
}

