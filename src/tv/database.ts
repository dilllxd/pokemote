import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TVCredential {
  ip: string;
  clientKey: string;
  secure: boolean;
  name?: string;
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
        name TEXT,
        created_at TEXT NOT NULL,
        last_used TEXT NOT NULL,
        is_valid INTEGER NOT NULL DEFAULT 1
      )
    `);

    // Migration: ensure 'name' column exists for older databases
    try {
      const cols = this.db.prepare("PRAGMA table_info(tv_credentials)").all() as any[];
      const hasName = cols.some((c) => c.name === "name");
      if (!hasName) {
        this.db.exec("ALTER TABLE tv_credentials ADD COLUMN name TEXT");
      }
    } catch {
      // ignore migration errors
    }

    console.log("✅ Database initialized");
  }

  /**
   * Save or update TV credentials
   */
  saveCredentials(ip: string, clientKey: string, secure: boolean = true, name?: string): void {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO tv_credentials (ip, client_key, secure, name, created_at, last_used, is_valid)
      VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(ip) DO UPDATE SET
        client_key = excluded.client_key,
        secure = excluded.secure,
        last_used = excluded.last_used,
        is_valid = 1,
        name = COALESCE(excluded.name, name)
    `);

    stmt.run(ip, clientKey, secure ? 1 : 0, name ?? null, now, now);
    console.log(`💾 Saved credentials for ${ip}`);
  }

  /**
   * Get credentials for a specific TV
   */
  getCredentials(ip: string): TVCredential | null {
    const stmt = this.db.prepare(`
      SELECT ip, client_key as clientKey, secure, name, created_at as createdAt, 
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
      name: row.name || undefined,
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
      SELECT ip, client_key as clientKey, secure, name, created_at as createdAt, 
             last_used as lastUsed, is_valid as isValid
      FROM tv_credentials
      ORDER BY last_used DESC
    `);

    const rows = stmt.all() as any[];
    return rows.map(row => ({
      ip: row.ip,
      clientKey: row.clientKey,
      secure: row.secure === 1,
       name: row.name || undefined,
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
      SELECT ip, client_key as clientKey, secure, name, created_at as createdAt, 
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
      name: row.name || undefined,
      createdAt: row.createdAt,
      lastUsed: row.lastUsed,
      isValid: row.isValid === 1,
    };
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
