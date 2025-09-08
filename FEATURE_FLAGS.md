# Feature Flags Configuration

This document explains how to control application features using boolean flags.

## Overview

Feature flags allow you to easily enable or disable specific features without modifying code logic. This is particularly useful for:
- Temporarily disabling features during maintenance
- Gradual feature rollouts
- A/B testing
- Emergency feature toggles

## Registration Control

### Server-Side Configuration

**File:** `server/config/features.js`

```javascript
module.exports = {
  // Registration control
  REGISTRATION_ENABLED: true,  // Set to false to disable registration
  
  // Other feature flags can be added here
  // MAINTENANCE_MODE: false,
  // DEBUG_MODE: process.env.NODE_ENV === 'development',
};
```

### Client-Side Configuration

**File:** `client/src/config/features.js`

```javascript
export const features = {
  // Registration control - set to false to disable registration
  REGISTRATION_ENABLED: true,
  
  // Other feature flags can be added here
  // MAINTENANCE_MODE: false,
  // DEBUG_MODE: import.meta.env.DEV,
};
```

## How to Enable/Disable Registration

### Method 1: Edit Configuration Files

1. **To Disable Registration:**
   - Set `REGISTRATION_ENABLED: false` in both config files
   - Restart the server (or wait for nodemon to restart)

2. **To Enable Registration:**
   - Set `REGISTRATION_ENABLED: true` in both config files
   - Restart the server (or wait for nodemon to restart)

### Method 2: Environment Variables (Future Enhancement)

You could extend this to use environment variables:

```javascript
// server/config/features.js
module.exports = {
  REGISTRATION_ENABLED: process.env.REGISTRATION_ENABLED !== 'false',
};
```

## What Happens When Registration is Disabled

### Server-Side Behavior
- Registration endpoint returns HTTP 503 (Service Unavailable)
- Error message: "Registration is temporarily disabled"
- All validation and processing code remains intact

### Client-Side Behavior
- Registration form shows warning message
- All form inputs are disabled
- Submit button shows "Registration Disabled"
- Users see: "⚠️ Registration is temporarily disabled"

## Testing Feature Flags

### Test Registration Enabled
```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"password123","displayName":"Test User"}'
```

**Expected Response (when enabled):**
```json
{
  "message": "User created successfully",
  "token": "...",
  "user": {...}
}
```

### Test Registration Disabled
```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"password123","displayName":"Test User"}'
```

**Expected Response (when disabled):**
```json
{
  "error": "Registration is temporarily disabled",
  "message": "New user registration is currently not available. Please try again later."
}
```

## Adding New Feature Flags

### 1. Add to Server Config
```javascript
// server/config/features.js
module.exports = {
  REGISTRATION_ENABLED: true,
  MAINTENANCE_MODE: false,        // New flag
  DEBUG_MODE: process.env.NODE_ENV === 'development',  // New flag
};
```

### 2. Add to Client Config
```javascript
// client/src/config/features.js
export const features = {
  REGISTRATION_ENABLED: true,
  MAINTENANCE_MODE: false,        // New flag
  DEBUG_MODE: import.meta.env.DEV,  // New flag
};
```

### 3. Use in Components
```javascript
import { features } from '../config/features';

const MyComponent = () => {
  if (features.MAINTENANCE_MODE) {
    return <MaintenanceMessage />;
  }
  
  return <NormalContent />;
};
```

### 4. Use in Server Routes
```javascript
const { MAINTENANCE_MODE } = require('../config/features');

app.use((req, res, next) => {
  if (MAINTENANCE_MODE) {
    return res.status(503).json({ error: 'Service under maintenance' });
  }
  next();
});
```

## Best Practices

1. **Keep Flags Simple**: Use clear, boolean values when possible
2. **Document Changes**: Update this file when adding new flags
3. **Test Both States**: Always test both enabled and disabled states
4. **Centralize Configuration**: Use dedicated config files
5. **Environment-Specific**: Consider different settings for dev/staging/prod
6. **Graceful Degradation**: Ensure the app works when features are disabled

## Current Feature Flags

| Flag | Description | Default | Files |
|------|-------------|---------|-------|
| `REGISTRATION_ENABLED` | Controls user registration | `true` | `server/config/features.js`, `client/src/config/features.js` |

## Troubleshooting

### Registration Not Working
1. Check both config files have `REGISTRATION_ENABLED: true`
2. Restart the server
3. Check server logs for errors
4. Verify database connection

### Frontend Not Updating
1. Check client config file
2. Hard refresh the browser
3. Check browser console for errors
4. Verify Vite is running

### Inconsistent Behavior
1. Ensure both server and client configs match
2. Check for typos in flag names
3. Verify imports are correct
4. Restart both server and client
