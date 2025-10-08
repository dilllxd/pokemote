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

  // ==================== SYSTEM CONTROL ====================
  
  async powerOff() {
    return this.client.request("ssap://system/turnOff");
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

  // ==================== APPLICATIONS ====================
  
  async listApps() {
    try {
      // Try to get all installed apps (requires READ_INSTALLED_APPS permission)
      const result = await this.client.request("ssap://com.webos.applicationManager/listLaunchPoints");
      return result.launchPoints;
    } catch (err: any) {
      // Fallback: return common LG TV apps if permission denied
      if (err.message.includes("401") || err.message.includes("insufficient")) {
        console.warn("⚠️  Insufficient permissions for listLaunchPoints, returning common apps");
        return this.getCommonApps();
      }
      throw err;
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
      { id: "plex", title: "Plex", icon: "▶️" },
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
   * Search for content across apps (if supported by TV)
   * This may not work on all WebOS versions
   */
  async searchContent(query: string) {
    try {
      return await this.client.request("ssap://com.webos.service.search/search", {
        query,
      });
    } catch (err) {
      // Fallback: just open search app with query
      return this.openSearch(query);
    }
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

