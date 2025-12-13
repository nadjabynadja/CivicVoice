# Vercel Deployment Guide for CivicVoice

This guide explains how to deploy CivicVoice to Vercel.

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Vercel CLI** (optional): `npm i -g vercel`
3. **PostgreSQL Database**: Required for the backend API

## Project Structure

```
CivicVoice/
├── api/
│   └── index.js          # Serverless function wrapper for Express
├── server/
│   └── src/
│       ├── index.js      # Express application
│       └── ...           # API routes, config, etc.
├── *.html                # Frontend static files
├── *.js                  # Frontend JavaScript
└── vercel.json           # Vercel configuration
```

## Deployment Methods

### Method 1: Deploy via Vercel Dashboard (Recommended)

1. **Connect Repository**:
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your GitHub repository
   - Select the CivicVoice repository

2. **Configure Project**:
   - Framework Preset: **Other**
   - Root Directory: `./` (leave as default)
   - Build Command: (leave empty)
   - Output Directory: (leave empty)

3. **Set Environment Variables**:
   Add the following environment variables in the Vercel dashboard:

   ```
   DATABASE_URL=postgresql://user:password@host:port/database
   NODE_ENV=production
   CORS_ORIGIN=https://your-domain.vercel.app

   # Optional rate limiting configuration
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=1000

   # Optional JWT configuration (if using auth)
   JWT_SECRET=your-secret-key
   ```

4. **Deploy**:
   - Click "Deploy"
   - Vercel will automatically deploy your application

### Method 2: Deploy via Vercel CLI

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   # First deployment
   vercel

   # Production deployment
   vercel --prod
   ```

4. **Set Environment Variables**:
   ```bash
   vercel env add DATABASE_URL
   vercel env add NODE_ENV
   vercel env add CORS_ORIGIN
   ```

## Configuration Details

### vercel.json

The `vercel.json` file configures:

- **Builds**: Compiles the Express API as a serverless function and serves static files
- **Routes**:
  - `/api/*` → Serverless Express API
  - `/health` → API health check
  - `/*` → Static frontend files
- **Functions**: Configures memory (1024MB) and timeout (10s) for the API
- **Regions**: Deploys to `iad1` (US East)

### Environment Variables Required

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `NODE_ENV` | Environment (production) | Yes |
| `CORS_ORIGIN` | Allowed CORS origins | Yes |
| `JWT_SECRET` | Secret for JWT tokens | If using auth |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | Optional |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | Optional |

## Database Setup

### Option 1: Vercel Postgres

1. Go to your project in Vercel Dashboard
2. Navigate to **Storage** → **Create Database**
3. Select **Postgres**
4. Vercel will automatically set the `DATABASE_URL` environment variable

### Option 2: External PostgreSQL

Use any PostgreSQL provider:
- [Neon](https://neon.tech) (recommended, free tier)
- [Supabase](https://supabase.com)
- [Railway](https://railway.app)
- [AWS RDS](https://aws.amazon.com/rds/)
- [DigitalOcean Managed Databases](https://www.digitalocean.com/products/managed-databases)

Then set the `DATABASE_URL` environment variable in Vercel.

## Post-Deployment

### 1. Run Database Migrations

If you need to set up the database schema:

```bash
# Connect to your deployed serverless function
vercel env pull

# Run migrations locally against production DB
cd server
npm run db:migrate
```

### 2. Test the Deployment

- **Frontend**: `https://your-project.vercel.app/`
- **API**: `https://your-project.vercel.app/api`
- **Health Check**: `https://your-project.vercel.app/health`

### 3. Update CORS Origin

Update the `CORS_ORIGIN` environment variable to match your Vercel domain:

```bash
vercel env add CORS_ORIGIN production
# Enter: https://your-project.vercel.app
```

## Continuous Deployment

Vercel automatically deploys:
- **Production**: Commits to `main` or `master` branch
- **Preview**: All other branches and pull requests

## Monitoring

### View Logs

```bash
vercel logs
```

Or view in the Vercel Dashboard:
- Go to your project
- Click on a deployment
- Navigate to **Functions** → **Logs**

### Performance Monitoring

Vercel provides built-in analytics:
- Go to your project
- Navigate to **Analytics** tab

## Troubleshooting

### API Returns 404

- Verify routes in `vercel.json` are correct
- Check that `api/index.js` exists and exports the Express app

### Database Connection Errors

- Verify `DATABASE_URL` is set correctly
- Ensure database allows connections from Vercel IPs
- Check database is accessible from the internet

### Timeout Errors

- Increase `maxDuration` in `vercel.json` (max 10s on Hobby plan)
- Consider upgrading to Pro plan for 60s timeout
- Optimize slow database queries

### CORS Errors

- Set `CORS_ORIGIN` to match your Vercel domain
- Include `https://` in the origin URL
- Use `*` for development (not recommended for production)

## Custom Domain

1. Go to your project in Vercel Dashboard
2. Navigate to **Settings** → **Domains**
3. Add your custom domain
4. Update DNS records as instructed
5. Update `CORS_ORIGIN` environment variable

## Rollback

To rollback to a previous deployment:

1. Go to Vercel Dashboard
2. Navigate to **Deployments**
3. Find the working deployment
4. Click **⋯** → **Promote to Production**

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Node.js Runtime](https://vercel.com/docs/runtimes#official-runtimes/node-js)
- [Environment Variables](https://vercel.com/docs/environment-variables)
- [Serverless Functions](https://vercel.com/docs/serverless-functions/introduction)

## Support

For issues specific to Vercel deployment, check:
- [Vercel Community](https://github.com/vercel/vercel/discussions)
- [Vercel Support](https://vercel.com/support)
