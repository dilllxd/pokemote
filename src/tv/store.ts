import { writeFile, readFile, access } from "fs/promises";
import { constants } from "fs";
import path from "path";

export interface TVStore {
  ip: string;
  clientKey: string;
  name?: string;
  secure?: boolean;
}

const STORE_PATH = path.join(process.cwd(), "tv-credentials.json");

/**
 * Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load TV credentials from file
 */
export async function loadCredentials(): Promise<TVStore | null> {
  try {
    if (!(await fileExists(STORE_PATH))) return null;

    const data = await readFile(STORE_PATH, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Failed to load credentials:", err);
    return null;
  }
}

/**
 * Save TV credentials to file
 */
export async function saveCredentials(store: TVStore): Promise<void> {
  try {
    await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
    console.log("✅ Credentials saved to", STORE_PATH);
  } catch (err) {
    console.error("Failed to save credentials:", err);
    throw err;
  }
}

/**
 * Delete saved credentials
 */
export async function deleteCredentials(): Promise<void> {
  try {
    if (await fileExists(STORE_PATH)) {
      const { unlink } = await import("fs/promises");
      await unlink(STORE_PATH);
    }
  } catch (err) {
    console.error("Failed to delete credentials:", err);
  }
}

