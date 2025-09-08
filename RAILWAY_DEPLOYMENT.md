# Railway Deployment Guide

This guide explains how to deploy your Beep Boop Chat application to Railway.

## Prerequisites

1. Railway account (sign up at [railway.app](https://railway.app))
2. GitHub repository connected to Railway
3. PostgreSQL database (Railway provides this)

## Deployment Steps

### 1. Database Setup

1. In Railway dashboard, create a new PostgreSQL database
2. Railway will provide a `DATABASE_URL` environment variable
3. The application will automatically parse this URL for database connection

### 2. Environment Variables

Set these environment variables in Railway:

#### Required Variables:
- `NODE_ENV=production`
- `DATABASE_URL` (provided by Railway PostgreSQL service)
- `CLIENT_URL` (your Railway app URL, e.g., `https://your-app.railway.app`)

#### Optional Variables (if not using DATABASE_URL):
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

### 3. Build Configuration

The application uses these build commands:
- `npm run build:all` - Builds both client and server
- `npm start` - Starts the production server

### 4. Deployment Process

1. **Connect Repository**: Connect your GitHub repository to Railway
2. **Add PostgreSQL**: Add a PostgreSQL service to your project
3. **Set Environment Variables**: Configure the required environment variables
4. **Deploy**: Railway will automatically build and deploy your application

### 5. Build Process

Railway will:
1. Install dependencies (`npm install`)
2. Build the client (`cd client && npm run build`)
3. Install server dependencies (`cd server && npm install`)
4. Start the server (`cd server && npm start`)

### 6. Static File Serving

In production, the server serves:
- Static files from `client/build/` directory
- React app for all non-API routes
- API routes under `/api/*`

## Troubleshooting

### Database Connection Issues

If you see `ECONNREFUSED ::1:5432`:
- Ensure `DATABASE_URL` is set correctly
- Check that PostgreSQL service is running
- Verify the database URL format

### Build File Issues

If you see `ENOENT: no such file or directory, stat '/client/build/index.html'`:
- Ensure the build process completed successfully
- Check that Vite build output is in the correct directory
- Verify the build command is `npm run build:all`

### Environment Variables

Make sure these are set in Railway:
- `NODE_ENV=production`
- `DATABASE_URL` (from PostgreSQL service)
- `CLIENT_URL` (your app's URL)

## File Structure

```
/
├── client/
│   ├── build/          # Vite build output
│   ├── src/
│   └── vite.config.js
├── server/
│   ├── index.js        # Main server file
│   └── database/
├── railway.json        # Railway configuration
└── package.json        # Root package.json
```

## Health Check

The application provides a health check endpoint at `/api/health` that Railway can use to monitor the service.

## Socket.IO Configuration

Socket.IO is configured to work with Railway's proxy setup. The CORS settings automatically adjust based on the `CLIENT_URL` environment variable.

## Database Schema

Make sure to run the database schema after deployment:
```sql
-- Run the contents of server/database/schema.sql
-- This can be done through Railway's database console
```

## Monitoring

Railway provides:
- Application logs
- Database metrics
- Performance monitoring
- Automatic deployments on git push

## Support

If you encounter issues:
1. Check Railway logs in the dashboard
2. Verify environment variables are set correctly
3. Ensure the database is accessible
4. Check that all build steps completed successfully
