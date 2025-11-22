import crypto from 'crypto';

/**
 * API Key Authentication Utility
 *
 * Handles authentication for the MCP server using API keys with sk- prefix format
 */

export interface AuthConfig {
  enabled: boolean;
  apiKeys: string[];
}

/**
 * Validates an API key format and prefix
 */
export function validateApiKeyFormat(key: string): boolean {
  if (typeof key !== 'string' || key.length < 10) {
    return false;
  }

  // Should start with 'sk-' followed by at least 8 characters
  return key.startsWith('sk-') && key.length > 10;
}

/**
 * Generates a secure random API key with sk- prefix
 */
export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `sk-${randomBytes}`;
}

/**
 * Creates an authentication configuration from environment variables
 */
export function createAuthConfig(): AuthConfig {
  const enabled = process.env.MCP_AUTH_ENABLED !== 'false';

  if (!enabled) {
    return {
      enabled: false,
      apiKeys: [],
    };
  }

  // Parse API keys from environment variable (comma-separated)
  const apiKeysEnv = process.env.MCP_API_KEYS || '';
  const apiKeys = apiKeysEnv
    .split(',')
    .map(key => key.trim())
    .filter(key => validateApiKeyFormat(key));

  if (apiKeys.length === 0) {
    console.warn('⚠️  Authentication is enabled but no valid API keys configured. Set MCP_API_KEYS environment variable.');
  }

  return {
    enabled: true,
    apiKeys,
  };
}

/**
 * Extracts API key from Authorization header
 */
export function extractApiKeyFromHeader(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }

  // Support "Bearer sk-xxx" and "sk-xxx" formats
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return authHeader.trim();
}

/**
 * Validates an API key against the configuration
 */
export function validateApiKey(key: string, config: AuthConfig): boolean {
  if (!config.enabled) {
    return true; // No auth required
  }

  // Check API keys
  return config.apiKeys.includes(key);
}

/**
 * Creates authentication middleware for Express
 */
export function createAuthMiddleware(config: AuthConfig) {
  return (req: any, res: any, next: any) => {
    if (!config.enabled) {
      return next(); // No auth required
    }

    const apiKey = extractApiKeyFromHeader(req.headers.authorization);

    if (!apiKey) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'API key required. Use Authorization header with "Bearer sk-xxx" or "sk-xxx" format.',
      });
    }

    if (!validateApiKeyFormat(apiKey)) {
      return res.status(401).json({
        error: 'Invalid API key format',
        message: 'API key must start with "sk-" and be at least 10 characters long.',
      });
    }

    if (!validateApiKey(apiKey, config)) {
      return res.status(403).json({
        error: 'Invalid API key',
        message: 'The provided API key is not valid or has been revoked.',
      });
    }

    // Store API key in request for potential logging/usage tracking
    req.apiKey = apiKey;

    next();
  };
}