import crypto from "crypto";
import { ThinQOAuthClient } from "./thinq-oauth.js";

export interface SearchConfig {
  deviceModel?: string;
  deviceLanguage?: string;
  deviceCountry?: string;
  devicePlatform?: string;
  appKey?: string;
}

export interface SearchParams {
  query: string;
  startIndex?: number;
  maxResults?: number;
}

export interface SearchResult {
  // Results structure will depend on the API response
  [key: string]: any;
}

/**
 * ThinQ Search Client for searching content via LG ThinQ API
 */
export class ThinQSearchClient {
  private oauthClient: ThinQOAuthClient;
  private config: Required<SearchConfig>;
  private readonly searchBaseUrl = "https://kic.thinqrecommend.lgtvcommon.com/search/v1.0";

  constructor(oauthClient: ThinQOAuthClient, config?: SearchConfig) {
    this.oauthClient = oauthClient;
    this.config = {
      deviceModel: config?.deviceModel || "HE_DTV_W24G_AFABATAA",
      deviceLanguage: config?.deviceLanguage || "en-IN",
      deviceCountry: config?.deviceCountry || "IN",
      devicePlatform: config?.devicePlatform || "W24G",
      appKey: config?.appKey || "LGAO221A02",
    };
  }

  /**
   * Generate OAuth signature for search API
   */
  private generateOAuthSignature(method: string, url: string, timestamp: string): string {
    const message = `${method}\n${url}\n${timestamp}`;
    const hash = crypto.createHash("sha1").update(message).digest();
    return hash.toString("base64");
  }

  /**
   * Get search API headers
   */
  private getSearchHeaders(accessToken: string): Record<string, string> {
    const timestamp = new Date().toUTCString();
    const signature = this.generateOAuthSignature("POST", "/search/v1.0/retrieval", timestamp);

    return {
      "Host": "kic.thinqrecommend.lgtvcommon.com",
      "X-App-Language": this.config.deviceLanguage.split("-")[0],
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      "X-Device-Model": this.config.deviceModel,
      "X-Device-Language": this.config.deviceLanguage,
      "X-Device-FCK": "2191",
      "X-Oauth-appkey": this.config.appKey,
      "X-Device-Type": "M01",
      "X-Device-Eco-Info": "1",
      "X-Device-Netcast-Platform-Version": "10.2.0",
      "X-Device-Publish-Flag": "Y",
      "Origin": "file://",
      "X-Device-Product": "webOSTV 24",
      "X-Oauth-Signature": signature,
      "X-Device-ID": "dT9Mr8wm7F8pe4GmQrG3RnDgXbnUbqf9IU7Rp77Z22KRn0z08Bu7jUYkqjj6v6hTS5buDucnQA0ZSHDHAMyrJP+40HHuRlGblZmlToZj3B9GampcISSOM49Qud6lCLvt",
      "X-Device-Country": this.config.deviceCountry,
      "Connection": "keep-alive",
      "X-Device-Platform": this.config.devicePlatform,
      "X-Device-Eula": "networkAllowed,chpAllowed,generalTermsAllowed",
      "Accept-Language": this.config.deviceLanguage,
      "X-App-Country": this.config.deviceCountry,
      "Accept": "application/json, text/plain, */*",
      "X-Oauth-Date": timestamp,
      "X-Device-Country-Group": "AJ",
      "Content-Type": "application/json",
    };
  }

  /**
   * Search for content
   */
  async search(params: SearchParams): Promise<SearchResult> {
    try {
      // Get valid access token (will refresh if needed)
      const accessToken = await this.oauthClient.getValidAccessToken();

      const url = `${this.searchBaseUrl}/retrieval`;
      const headers = this.getSearchHeaders(accessToken);

      const requestBody = {
        query: params.query,
        startIndex: params.startIndex || 1,
        maxResults: params.maxResults || 30,
        empServerMode: "OP",
        accessToken: accessToken,
      };

      console.log(`🔍 Searching for: "${params.query}"`);

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Search request failed (${response.status}): ${errorText}`);
      }

      const data = await response.json() as SearchResult;
      console.log(`✅ Search completed: ${params.query}`);
      
      return data;
    } catch (error: any) {
      console.error("❌ Search failed:", error.message);
      throw error;
    }
  }

  /**
   * Search with auto-pagination
   */
  async searchAll(query: string, maxResults: number = 100): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    let startIndex = 1;
    const pageSize = 30;

    while (results.length < maxResults) {
      const response = await this.search({
        query,
        startIndex,
        maxResults: Math.min(pageSize, maxResults - results.length),
      });

      // The structure depends on the API response
      // Adjust this based on actual response format
      const items = response.results || response.items || [];
      
      if (items.length === 0) break;
      
      results.push(...items);
      startIndex += pageSize;

      // If we got less than pageSize, we've reached the end
      if (items.length < pageSize) break;
    }

    return results;
  }
}
