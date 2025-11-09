import { LGTVClient } from "./client";

/**
 * TV Control Commands - Organized by category
 */
export class TVCommands {
  constructor(private client: LGTVClient) {}

  // ==================== AUDIO/VOLUME ====================
  
  async volumeUp() {
    return this.client.request("ssap://audio/volumeUp");
  }

  async volumeDown() {
    return this.client.request("ssap://audio/volumeDown");
  }

  async setVolume(volume: number) {
    return this.client.request("ssap://audio/setVolume", { volume });
  }

  async getVolume() {
    return this.client.request("ssap://audio/getVolume");
  }

  async mute(mute: boolean) {
    return this.client.request("ssap://audio/setMute", { mute });
  }

  async getAudioOutput() {
    return this.client.request("ssap://audio/getSoundOutput");
  }

  async setAudioOutput(output: string) {
    // output: "tv_speaker", "external_speaker", "soundbar", "bt_soundbar"
    return this.client.request("ssap://audio/changeSoundOutput", { output });
  }

  // ==================== MEDIA PLAYBACK ====================
  
  async play() {
    return this.client.request("ssap://media.controls/play");
  }

  async pause() {
    return this.client.request("ssap://media.controls/pause");
  }

  async stop() {
    return this.client.request("ssap://media.controls/stop");
  }

  async rewind() {
    return this.client.request("ssap://media.controls/rewind");
  }

  async fastForward() {
    return this.client.request("ssap://media.controls/fastForward");
  }

  async getMediaStatus() {
    try {
      // Get foreground app info first
      let appId = null;
      try {
        appId = await this.getCurrentApp();
      } catch {}

      // Try getting media metadata (works for video/audio apps)
      try {
        const metadata = await this.client.request("ssap://media.viewer/getMediaMetaData");
        return {
          playing: true,
          appId,
          mediaType: metadata.mediaType,
          title: metadata.title,
          duration: metadata.duration,
          position: metadata.position,
          metadata,
        };
      } catch {
        // If media metadata fails, check foreground media app info
        try {
          const appInfo = await this.client.request("ssap://com.webos.media/getForegroundAppInfo");
          return {
            playing: appInfo.foregroundAppInfo?.length > 0,
            appId,
            foregroundAppInfo: appInfo.foregroundAppInfo || [],
          };
        } catch {
          return {
            playing: false,
            appId,
            error: "Unable to determine media status"
          };
        }
      }
    } catch (err: any) {
      return {
        playing: false,
        appId: null,
        error: err.message
      };
    }
  }

  async getForegroundMediaInfo() {
    return this.client.request("ssap://com.webos.media/getForegroundAppInfo");
  }

  // ==================== SYSTEM CONTROL ====================
  
  async powerOff() {
    return this.client.request("ssap://system/turnOff");
  }

  async powerOn() {
    return this.client.request("ssap://system/turnOn");
  }

  async screenOff() {
    return this.client.request("ssap://com.webos.service.tvpower/power/turnOffScreen", {
      standbyMode: "active",
    });
  }

  async screenOn() {
    return this.client.request("ssap://com.webos.service.tvpower/power/turnOnScreen", {
      standbyMode: "active",
    });
  }

  async getSystemInfo() {
    return this.client.request("ssap://com.webos.service.update/getCurrentSWInformation");
  }

  async notify(message: string, iconData?: string, iconExtension?: string) {
    return this.client.request("ssap://system.notifications/createToast", {
      message,
      iconData,
      iconExtension,
    });
  }

  // ==================== SEARCH ====================
  
  async searchContent(query: string) {
    try {
      console.log(`🔍 Searching for: "${query}"`);
      
      // Try direct SSAP search endpoint first
      try {
        const result = await this.client.request("ssap://com.webos.service.search/search", {
          query: query
        });
        console.log("✅ Search executed via SSAP");
        return {
          success: true,
          message: `Search results for "${query}"`,
          query,
          results: result
        };
      } catch (ssapErr: any) {
        console.log("⚠️  SSAP search failed, trying alternative methods...");
        
        // Try launching search app with query
        await this.launchApp("com.webos.app.search", undefined, { query });
        return {
          success: true,
          message: `Search app launched with query "${query}"`,
          query
        };
      }
    } catch (err: any) {
      console.error("❌ Search failed:", err.message);
      throw err;
    }
  }

  async searchContentAdvanced(query: string, categories?: string[]) {
    try {
      console.log(`🔍 Advanced search for: "${query}"`, categories);
      
      const params: any = { query };
      
      if (categories && categories.length > 0) {
        params.categories = categories;
      }

      // Try direct SSAP search endpoint
      try {
        const result = await this.client.request("ssap://com.webos.service.search/search", params);
        console.log("✅ Search executed via SSAP");
        return {
          success: true,
          message: `Search results for "${query}"`,
          query,
          categories,
          results: result
        };
      } catch (ssapErr: any) {
        console.log("⚠️  SSAP search failed, trying search app...");
        
        // Fallback to launching search app
        await this.launchApp("com.webos.app.search", undefined, params);
        return {
          success: true,
          message: `Search app launched with query "${query}"`,
          query,
          categories
        };
      }
    } catch (err: any) {
      console.error("❌ Search failed:", err.message);
      throw err;
    }
  }

  // ==================== APPLICATIONS ====================
  
  async listApps() {
    try {
      console.log("📱 Requesting apps from TV...");
      const result = await this.client.request("ssap://com.webos.applicationManager/listLaunchPoints");
      
      // Handle different response structures
      // if (result.apps && Array.isArray(result.apps)) {
      //   console.log(`✅ Received ${result.apps.length} apps from TV`);
      //   return result.apps.map((app: any) => ({
      //     id: app.id,
      //     title: app.title || app.id,
      //     icon: app.icon,
      //     largeIcon: app.largeIcon,
      //     appType: app.appType,
      //   }));
      // }
      
      if (result.launchPoints && Array.isArray(result.launchPoints)) {
        console.log(`✅ Received ${result.launchPoints.length} launch points from TV`);
        return result.launchPoints.map((app: any) => ({
          id: app.id,
          title: app.title || app.id,
          icon: app.icon,
          largeIcon: app.largeIcon,
          appType: app.appType,
        }));
      }
      
      console.log("⚠️  Unexpected response structure, using fallback");
      return this.getCommonApps();
    } catch (err: any) {
      console.error("❌ Failed to list apps:", err.message);
      console.log("📋 Using fallback common apps list");
      return this.getCommonApps();
    }
  }

  async listRunningApps() {
    // List currently running apps (requires READ_RUNNING_APPS permission which is usually available)
    try {
      const result = await this.client.request("ssap://com.webos.service.applicationmanager/listRunningApps");
      return result.running || [];
    } catch (err: any) {
      // Try alternative endpoint
      try {
        const result = await this.client.request("ssap://com.webos.applicationManager/listApps");
        return result.apps || [];
      } catch {
        // If both fail, return empty array
        return [];
      }
    }
  }

  /**
   * Get a list of common LG TV apps
   * This is a fallback when we can't query installed apps
   */
  getCommonApps() {
    return [
      {id:"com.webos.app.home", title: "Home", icon: "🏠"},
      { id: "com.webos.app.livetv", title: "Live TV", icon: "📺" },
      { id: "youtube.leanback.v4", title: "YouTube", icon: "▶️" },
      { id: "com.webos.app.hdmi1", title: "HDMI 1", icon: "🔌" },
      { id: "com.webos.app.hdmi2", title: "HDMI 2", icon: "🔌" },
      { id: "com.webos.app.hdmi3", title: "HDMI 3", icon: "🔌" },
      { id: "com.webos.app.hdmi4", title: "HDMI 4", icon: "🔌" },
      { id: "netflix", title: "Netflix", icon: "🎬" },
      { id: "amazon", title: "Amazon Prime Video", icon: "📦" },
      { id: "com.webos.app.browser", title: "Web Browser", icon: "🌐" },
      { id: "spotify-beehive", title: "Spotify", icon: "🎵" },
      { id: "com.webos.app.photovideo", title: "Photos & Videos", icon: "📷" },
      { id: "com.webos.app.music", title: "Music", icon: "🎵" },
      { id: "com.webos.app.discovery", title: "LG Content Store", icon: "🏪" },
      { id: "com.webos.app.screenshare", title: "Screen Share", icon: "📱" },
      { id: "com.webos.app.smartshare", title: "Smart Share", icon: "📂" },
      { id: "com.webos.app.notificationcenter", title: "Notifications", icon: "🔔" },
      { id: "com.webos.app.connectionwizard", title: "Connection Wizard", icon: "⚙️" },
      { id: "com.webos.app.search", title: "Search", icon: "🔍" },
      { id: "Disney+", title: "Disney Plus", icon: "🏰" },
      { id: "hulu", title: "Hulu", icon: "📺" },
      { id: "com.webos.app.appletvplus", title: "Apple TV+", icon: "🍎" },
      { id: "cdp-30", title: "Plex", icon: "▶️" },
    ];
  }

  async launchApp(appId: string, contentId?: string, params?: any) {
    return this.client.request("ssap://system.launcher/launch", {
      id: appId,
      contentId,
      params,
    });
  }

  async getCurrentApp() {
    const result = await this.client.request(
      "ssap://com.webos.applicationManager/getForegroundAppInfo"
    );
    return result.appId;
  }

  async closeApp(appInfo: any) {
    return this.client.request("ssap://system.launcher/close", appInfo);
  }

  // ==================== TV/CHANNELS ====================
  
  async channelUp() {
    return this.client.request("ssap://tv/channelUp");
  }

  async channelDown() {
    return this.client.request("ssap://tv/channelDown");
  }

  async setChannel(channelId: string) {
    return this.client.request("ssap://tv/openChannel", { channelId });
  }

  async getCurrentChannel() {
    return this.client.request("ssap://tv/getCurrentChannel");
  }

  async getChannelList() {
    return this.client.request("ssap://tv/getChannelList");
  }

  async getCurrentProgram() {
    return this.client.request("ssap://tv/getChannelProgramInfo");
  }

  // ==================== INPUT SOURCES ====================
  
  async listInputs() {
    const result = await this.client.request("ssap://tv/getExternalInputList");
    return result.devices;
  }

  async setInput(inputId: string) {
    return this.client.request("ssap://tv/switchInput", { inputId });
  }

  // ==================== TEXT INPUT ====================
  
  async typeText(text: string) {
    return this.client.request("ssap://com.webos.service.ime/insertText", {
      text,
      replace: 0,
    });
  }

  async deleteCharacters(count: number) {
    return this.client.request("ssap://com.webos.service.ime/deleteCharacters", { count });
  }

  async sendEnter() {
    return this.client.request("ssap://com.webos.service.ime/sendEnterKey");
  }

  // ==================== REMOTE NAVIGATION ====================

  async pressButton(button: "UP" | "DOWN" | "LEFT" | "RIGHT" | "ENTER" | "BACK" | "HOME" | "EXIT" | "RED" | "GREEN" | "YELLOW" | "BLUE") {
    // LG webOS uses pointer input socket for remote control buttons
    return this.client.sendButton(button);
  }

  async pressUp() {
    return this.pressButton("UP");
  }

  async pressDown() {
    return this.pressButton("DOWN");
  }

  async pressLeft() {
    return this.pressButton("LEFT");
  }

  async pressRight() {
    return this.pressButton("RIGHT");
  }

  async pressOk() {
    return this.pressButton("ENTER");
  }

  async pressBack() {
    return this.pressButton("BACK");
  }

  async pressHome() {
    return this.pressButton("HOME");
  }

  // ==================== SUBSCRIPTIONS ====================
  
  async subscribeVolume(callback: (data: any) => void) {
    return this.client.subscribe("ssap://audio/getVolume", callback);
  }

  async subscribeCurrentApp(callback: (data: any) => void) {
    return this.client.subscribe(
      "ssap://com.webos.applicationManager/getForegroundAppInfo",
      callback
    );
  }

  async subscribeCurrentChannel(callback: (data: any) => void) {
    return this.client.subscribe("ssap://tv/getCurrentChannel", callback);
  }

  async subscribeMediaState(callback: (data: any) => void) {
    return this.client.subscribe("ssap://com.webos.media/getForegroundAppInfo", callback);
  }

  // ==================== SEARCH ====================

  /**
   * Open system search with optional query
   * Note: This opens the WebOS universal search interface
   */
  async openSearch(query?: string) {
    // Launch the search app (WebOS built-in search)
    return this.client.request("ssap://system.launcher/launch", {
      id: "com.webos.app.search",
      params: query ? { query } : undefined,
    });
  }


  /**
   * Search for apps by name
   */
  async searchApps(query: string) {
    const apps = await this.listApps();
    const lowerQuery = query.toLowerCase();
    
    return apps.filter((app: any) => 
      app.title?.toLowerCase().includes(lowerQuery) ||
      app.id?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Search for channels by name or number
   */
  async searchChannels(query: string) {
    const channels = await this.getChannelList();
    const lowerQuery = query.toLowerCase();
    
    return channels.filter((channel: any) => 
      channel.channelName?.toLowerCase().includes(lowerQuery) ||
      channel.channelNumber?.toString().includes(query)
    );
  }

}

