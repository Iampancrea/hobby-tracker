# Use Node.js LTS version
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files (if you add a package.json later)
# COPY package*.json ./
# RUN npm install

# Copy application files
COPY server.js .
COPY public ./public

# Create data directory for persistent storage
RUN mkdir -p /usr/src/app/data

# Expose the port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Run the server
CMD ["node", "server.js"]
