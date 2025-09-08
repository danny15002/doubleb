# API Host URL Configuration in Vite

This document explains how to configure the API host URL for different environments in your Vite React application.

## Configuration Methods

### 1. Environment Variables (Recommended)

Vite uses environment variables prefixed with `VITE_` to expose them to the client-side code.

#### Environment Files

Create environment-specific files in the `client/` directory:

**`.env`** (default for all environments):
```bash
VITE_API_BASE_URL=http://localhost:5001
VITE_SERVER_URL=http://localhost:5001
```

**`.env.development`** (development environment):
```bash
VITE_API_BASE_URL=http://localhost:5001
VITE_SERVER_URL=http://localhost:5001
```

**`.env.production`** (production environment):
```bash
VITE_API_BASE_URL=https://your-api-domain.com
VITE_SERVER_URL=https://your-api-domain.com
```

**`.env.local`** (local overrides, ignored by git):
```bash
VITE_API_BASE_URL=http://localhost:3001
VITE_SERVER_URL=http://localhost:3001
```

#### Usage in Code

The environment variables are accessed using `import.meta.env`:

```javascript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';
```

### 2. Centralized Configuration

We've created a centralized configuration file at `src/config/api.js`:

```javascript
// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';

export const config = {
  apiBaseUrl: API_BASE_URL,
  serverUrl: SERVER_URL,
  endpoints: {
    auth: {
      login: '/api/auth/login',
      register: '/api/auth/register',
      me: '/api/auth/me'
    },
    chats: '/api/chats',
    messages: '/api/messages'
  }
};

// Helper function to get full API URL
export const getApiUrl = (endpoint) => {
  return `${config.apiBaseUrl}${endpoint}`;
};
```

### 3. Vite Configuration

You can also configure the API URL in `vite.config.js` using the `define` option:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    __API_BASE_URL__: JSON.stringify(process.env.VITE_API_BASE_URL || 'http://localhost:5001')
  },
  // ... other config
})
```

## Usage Examples

### In Components

```javascript
import { getApiUrl, config } from '../config/api';

// Using the helper function
const response = await fetch(getApiUrl('/api/chats'), {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Using the config object
const response = await axios.get(config.apiBaseUrl + '/api/auth/me');
```

### For Socket.IO

```javascript
import { config } from '../config/api';
import { io } from 'socket.io-client';

const socket = io(config.serverUrl, {
  auth: { token }
});
```

## Environment-Specific Builds

### Development
```bash
npm run dev
# Uses .env.development or .env
```

### Production
```bash
npm run build
# Uses .env.production or .env
```

### Custom Environment
```bash
VITE_API_BASE_URL=https://staging-api.com npm run build
```

## Docker Configuration

For Docker deployments, you can override environment variables:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ENV VITE_API_BASE_URL=https://your-production-api.com
RUN npm run build
```

Or use docker-compose:

```yaml
version: '3.8'
services:
  client:
    build: .
    environment:
      - VITE_API_BASE_URL=https://your-production-api.com
      - VITE_SERVER_URL=https://your-production-api.com
```

## Best Practices

1. **Never commit sensitive data** - Use `.env.local` for local overrides
2. **Use different files** for different environments
3. **Provide fallbacks** - Always have default values
4. **Centralize configuration** - Use a single config file
5. **Validate URLs** - Add validation for API URLs in production

## Current Implementation

The application now uses:
- Environment variables for configuration
- Centralized `src/config/api.js` for all API settings
- Updated all components to use the configuration
- Proper fallbacks for development and production

All API calls now go through the configuration system, making it easy to change the API host URL for different environments.
