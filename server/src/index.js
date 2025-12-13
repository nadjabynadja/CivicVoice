/**
 * CivicVoice API Server
 * Express server for voter data management, query building, list management, and mapping
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { db, testConnection } from './config/database.js';
import votersRouter from './routes/voters.js';
import queryRouter from './routes/query.js';
import listsRouter from './routes/lists.js';
import turfsRouter from './routes/turfs.js';
import exportRouter from './routes/export.js';
import statsRouter from './routes/stats.js';
import authRouter from './routes/auth.js';
import geocodeRouter from './routes/geocode.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Compression
app.use(compression());

// Request logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

// Health check
app.get('/health', async (req, res) => {
  try {
    await db.one('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/voters', votersRouter);
app.use('/api/query', queryRouter);
app.use('/api/lists', listsRouter);
app.use('/api/turfs', turfsRouter);
app.use('/api/export', exportRouter);
app.use('/api/stats', statsRouter);
app.use('/api/geocode', geocodeRouter);

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'CivicVoice API',
    version: '1.0.0',
    endpoints: {
      voters: {
        'GET /api/voters': 'List voters with filters',
        'GET /api/voters/:ncid': 'Get voter by NCID',
        'GET /api/voters/:ncid/history': 'Get voter vote history',
      },
      query: {
        'POST /api/query/build': 'Build and execute voter query',
        'POST /api/query/count': 'Get count for query',
        'GET /api/query/saved': 'List saved queries',
        'POST /api/query/save': 'Save a query',
      },
      lists: {
        'GET /api/lists': 'List all lists',
        'POST /api/lists': 'Create a list from query',
        'GET /api/lists/:id': 'Get list details',
        'GET /api/lists/:id/voters': 'Get voters in list',
        'POST /api/lists/:id/household': 'Group by household',
        'POST /api/lists/:id/randomize': 'Randomize list order',
      },
      turfs: {
        'GET /api/turfs': 'List all turfs',
        'POST /api/turfs/auto-cut': 'Auto-cut turf from list',
        'POST /api/turfs/manual': 'Create manual turf with polygon',
        'GET /api/turfs/:id/route': 'Get optimized route',
      },
      export: {
        'GET /api/export/csv/:listId': 'Export list as CSV',
        'GET /api/export/pdf/:listId': 'Export as PDF walk list',
        'GET /api/export/pdf/:turfId': 'Export turf as PDF',
      },
      stats: {
        'GET /api/stats/overview': 'Get database overview stats',
        'GET /api/stats/elections': 'Get election statistics',
        'GET /api/stats/demographics': 'Get demographic breakdown',
      },
    },
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Error]', err);

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server (only when not imported as a module)
async function startServer() {
  console.log('━'.repeat(60));
  console.log('🗳️  CivicVoice API Server');
  console.log('━'.repeat(60));

  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('❌ Could not connect to database. Please check configuration.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📚 API docs available at http://localhost:${PORT}/api`);
    console.log(`❤️  Health check at http://localhost:${PORT}/health`);
    console.log('\n━'.repeat(60));
  });
}

// Only start server if this file is run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
