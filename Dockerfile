FROM node:18-slim

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

# Copy source code
COPY server.js ./

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"]
