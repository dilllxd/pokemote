# Use Node.js 18 Alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Install tsx globally for TypeScript execution
RUN npm install -g tsx

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV MCP_PORT=3333
ENV PORT=3000
ENV MCP_AUTH_ENABLED=true

# Expose ports
EXPOSE 3333 3000

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S pokemote -u 1001

# Change ownership of app directory
RUN chown -R pokemote:nodejs /app

# Switch to non-root user
USER pokemote

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3333/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Default command - run MCP server
CMD ["node", "--import", "tsx", "src/mcp-index.ts"]