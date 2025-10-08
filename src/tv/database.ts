import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TVCredential {
  ip: string;
  clientKey: string;
  secure: boolean;
  createdAt: string;
  lastUsed: string;
  isValid: boolean;
}

class TVDatabase {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const defaultPath = path.join(__dirname, "../../tv-credentials.db");
    this.db = new Database(dbPath || defaultPath);
    this.initialize();
  }

  /**
   * Initialize database schema
   */
  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tv_credentials (
        ip TEXT PRIMARY KEY,
        client_key TEXT NOT NULL,
        secure INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        last_used TEXT NOT NULL,
        is_valid INTEGER NOT NULL DEFAULT 1
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS thinq_tokens (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        refresh_token TEXT NOT NULL,
        access_token TEXT,
        token_expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    console.log("✅ Database initialized");
  }

  /**
   * Save or update TV credentials
   */
  saveCredentials(ip: string, clientKey: string, secure: boolean = true): void {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO tv_credentials (ip, client_key, secure, created_at, last_used, is_valid)
      VALUES (?, ?, ?, ?, ?, 1)
      ON CONFLICT(ip) DO UPDATE SET
        client_key = excluded.client_key,
        secure = excluded.secure,
        last_used = excluded.last_used,
        is_valid = 1
    `);

    stmt.run(ip, clientKey, secure ? 1 : 0, now, now);
    console.log(`💾 Saved credentials for ${ip}`);
  }

  /**
   * Get credentials for a specific TV
   */
  getCredentials(ip: string): TVCredential | null {
    const stmt = this.db.prepare(`
      SELECT ip, client_key as clientKey, secure, created_at as createdAt, 
             last_used as lastUsed, is_valid as isValid
      FROM tv_credentials
      WHERE ip = ?
    `);

    const row = stmt.get(ip) as any;
    if (!row) return null;

    // Update last_used timestamp
    this.updateLastUsed(ip);

    return {
      ip: row.ip,
      clientKey: row.clientKey,
      secure: row.secure === 1,
      createdAt: row.createdAt,
      lastUsed: row.lastUsed,
      isValid: row.isValid === 1,
    };
  }

  /**
   * Get all stored TV credentials
   */
  getAllCredentials(): TVCredential[] {
    const stmt = this.db.prepare(`
      SELECT ip, client_key as clientKey, secure, created_at as createdAt, 
             last_used as lastUsed, is_valid as isValid
      FROM tv_credentials
      ORDER BY last_used DESC
    `);

    const rows = stmt.all() as any[];
    return rows.map(row => ({
      ip: row.ip,
      clientKey: row.clientKey,
      secure: row.secure === 1,
      createdAt: row.createdAt,
      lastUsed: row.lastUsed,
      isValid: row.isValid === 1,
    }));
  }

  /**
   * Mark credentials as invalid (expired/rejected)
   */
  invalidateCredentials(ip: string): void {
    const stmt = this.db.prepare(`
      UPDATE tv_credentials
      SET is_valid = 0
      WHERE ip = ?
    `);

    stmt.run(ip);
    console.log(`❌ Invalidated credentials for ${ip}`);
  }

  /**
   * Delete credentials for a TV
   */
  deleteCredentials(ip: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM tv_credentials
      WHERE ip = ?
    `);

    stmt.run(ip);
    console.log(`🗑️  Deleted credentials for ${ip}`);
  }

  /**
   * Update last_used timestamp
   */
  private updateLastUsed(ip: string): void {
    const stmt = this.db.prepare(`
      UPDATE tv_credentials
      SET last_used = ?
      WHERE ip = ?
    `);

    stmt.run(new Date().toISOString(), ip);
  }

  /**
   * Get most recently used TV
   */
  getMostRecentTV(): TVCredential | null {
    const stmt = this.db.prepare(`
      SELECT ip, client_key as clientKey, secure, created_at as createdAt, 
             last_used as lastUsed, is_valid as isValid
      FROM tv_credentials
      WHERE is_valid = 1
      ORDER BY last_used DESC
      LIMIT 1
    `);

    const row = stmt.get() as any;
    if (!row) return null;

    return {
      ip: row.ip,
      clientKey: row.clientKey,
      secure: row.secure === 1,
      createdAt: row.createdAt,
      lastUsed: row.lastUsed,
      isValid: row.isValid === 1,
    };
  }

  /**
   * Save ThinQ refresh token
   */
  saveThinQRefreshToken(refreshToken: string): void {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO thinq_tokens (id, refresh_token, created_at, updated_at)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        refresh_token = excluded.refresh_token,
        updated_at = excluded.updated_at
    `);

    stmt.run(refreshToken, now, now);
    console.log(`💾 Saved ThinQ refresh token`);
  }

  /**
   * Save ThinQ access token
   */
  saveThinQAccessToken(accessToken: string, expiresIn?: number): void {
    const now = new Date();
    const expiresAt = expiresIn 
      ? new Date(now.getTime() + expiresIn * 1000).toISOString()
      : null;
    
    const stmt = this.db.prepare(`
      UPDATE thinq_tokens
      SET access_token = ?,
          token_expires_at = ?,
          updated_at = ?
      WHERE id = 1
    `);

    stmt.run(accessToken, expiresAt, now.toISOString());
    console.log(`💾 Saved ThinQ access token`);
  }

  /**
   * Get ThinQ tokens
   */
  getThinQTokens(): { refreshToken: string; accessToken: string | null; expiresAt: string | null } | null {
    const stmt = this.db.prepare(`
      SELECT refresh_token as refreshToken, 
             access_token as accessToken,
             token_expires_at as expiresAt
      FROM thinq_tokens
      WHERE id = 1
    `);

    const row = stmt.get() as any;
    if (!row) return null;

    return {
      refreshToken: row.refreshToken,
      accessToken: row.accessToken,
      expiresAt: row.expiresAt,
    };
  }

  /**
   * Check if ThinQ access token is expired
   */
  isThinQTokenExpired(): boolean {
    const tokens = this.getThinQTokens();
    if (!tokens || !tokens.expiresAt) return true;

    const expiresAt = new Date(tokens.expiresAt);
    const now = new Date();
    
    // Consider expired if less than 5 minutes remaining
    return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

// Export singleton instance
export const tvDatabase = new TVDatabase();
