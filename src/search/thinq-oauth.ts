import crypto from "crypto";
import { tvDatabase } from "../tv/database.js";

export interface ThinQOAuthConfig {
  appKey: string;
  countryCode: string;
  languageCode: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

/**
 * ThinQ OAuth Client for managing LG ThinQ API authentication
 */
export class ThinQOAuthClient {
  private config: ThinQOAuthConfig;
  private readonly oauthBaseUrl = "https://in.lgeapi.com/oauth/1.0/oauth2";

  constructor(config?: Partial<ThinQOAuthConfig>) {
    this.config = {
      appKey: config?.appKey || "LGAO221A02",
      countryCode: config?.countryCode || "IN",
      languageCode: config?.languageCode || "en-IN",
    };
  }

  /**
   * Generate OAuth signature for LG API
   */
  private generateOAuthSignature(method: string, url: string, timestamp: string): string {
    const message = `${method}\n${url}\n${timestamp}`;
    const hash = crypto.createHash("sha1").update(message).digest();
    return hash.toString("base64");
  }

  /**
   * Get OAuth headers for LG API requests
   */
  private getOAuthHeaders(): Record<string, string> {
    const timestamp = new Date().toUTCString();
    const signature = this.generateOAuthSignature("POST", "/oauth/1.0/oauth2/token", timestamp);

    return {
      "Host": "in.lgeapi.com",
      "Accept": "application/json",
      "x-lge-oauth-signature": signature,
      "Accept-Language": this.config.languageCode,
      "x-lge-appkey": this.config.appKey,
      "x-lge-app-os": "IOS",
      "x-model-name": "Apple/iPhone 12 Pro",
      "User-Agent": "LG ThinQ/98 CFNetwork/3826.600.41 Darwin/24.6.0",
      "x-app-version": "LG ThinQ/5.1.15310",
      "x-lge-oauth-date": timestamp,
      "x-os-version": "iOS/18.6.2",
      "Connection": "keep-alive",
      "Content-Type": "application/x-www-form-urlencoded",
    };
  }

  /**
   * Exchange refresh token for new access token
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    const url = `${this.oauthBaseUrl}/token`;
    const headers = this.getOAuthHeaders();

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OAuth token refresh failed (${response.status}): ${errorText}`);
      }

      const data = await response.json() as TokenResponse;
      
      // Save tokens to database
      tvDatabase.saveThinQAccessToken(data.access_token, data.expires_in);
      
      // Update refresh token if a new one was provided
      if (data.refresh_token) {
        tvDatabase.saveThinQRefreshToken(data.refresh_token);
      }

      console.log("✅ ThinQ access token refreshed");
      return data;
    } catch (error: any) {
      console.error("❌ Failed to refresh access token:", error.message);
      throw error;
    }
  }

  /**
   * Get valid access token (refreshes if expired)
   */
  async getValidAccessToken(): Promise<string> {
    const tokens = tvDatabase.getThinQTokens();
    
    if (!tokens) {
      throw new Error("No ThinQ refresh token configured. Please set refresh token first.");
    }

    // Check if access token exists and is not expired
    if (tokens.accessToken && !tvDatabase.isThinQTokenExpired()) {
      return tokens.accessToken;
    }

    // Refresh the access token
    console.log("🔄 Access token expired, refreshing...");
    const response = await this.refreshAccessToken(tokens.refreshToken);
    return response.access_token;
  }

  /**
   * Save refresh token to database
   */
  saveRefreshToken(refreshToken: string): void {
    tvDatabase.saveThinQRefreshToken(refreshToken);
    console.log("✅ ThinQ refresh token saved");
  }

  /**
   * Get stored tokens
   */
  getStoredTokens(): { refreshToken: string; accessToken: string | null; expiresAt: string | null } | null {
    return tvDatabase.getThinQTokens();
  }

  /**
   * Authenticate with username/password to get initial refresh token
   * This implements the OAuth 2.0 password grant flow
   */
  async authenticate(username: string, password: string): Promise<TokenResponse> {
    const url = `${this.oauthBaseUrl}/token`;
    const headers = this.getOAuthHeaders();

    // Try password grant type
    const body = new URLSearchParams({
      grant_type: "password",
      username: username,
      password: password,
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Authentication failed (${response.status}): ${errorText}`);
      }

      const data = await response.json() as TokenResponse;
      
      // Save both tokens to database
      tvDatabase.saveThinQRefreshToken(data.refresh_token);
      tvDatabase.saveThinQAccessToken(data.access_token, data.expires_in);

      console.log("✅ ThinQ authentication successful");
      return data;
    } catch (error: any) {
      console.error("❌ Authentication failed:", error.message);
      throw error;
    }
  }
}
