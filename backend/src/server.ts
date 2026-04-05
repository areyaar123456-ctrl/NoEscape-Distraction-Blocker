import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { prisma } from './utils/prisma.js';
import { authRoutes } from './routes/auth.js';
import { deviceRoutes } from './routes/devices.js';
import { sessionRoutes } from './routes/sessions.js';
import { blocklistRoutes } from './routes/blocklists.js';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';
import fastifyStatic from '@fastify/static';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.env.NODE_ENV !== 'production';

dotenv.config();

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    authenticate: any;
  }
}

const fastify = Fastify({
  logger: true,
  ignoreTrailingSlash: true
});

// JWT Plugin
fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'supersecret',
});

// Basic CORS Implementation
fastify.addHook('onRequest', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,Cache-Control,Pragma,Expires,X-Requested-With');

  if (request.method === 'OPTIONS') {
    return reply.status(204).send();
  }
});

// Health check
fastify.get('/health', async (request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'OK', database: 'CONNECTED', timestamp: new Date().toISOString() };
  } catch (err: any) {
    console.error('[BACKEND_HEALTH_ERROR] Failed to connect to DB:', err);
    return reply.status(503).send({ error: `CRITICAL_DB_ERR: ${err.message}` });
  }
});

// Decorate fastify with prisma client
fastify.decorate('prisma', prisma);

// Decorate fastify with authenticate middleware
fastify.decorate('authenticate', async (request: any, reply: any) => {
  // Allow Desktop Tray native fetching 
  if (request.headers.authorization === 'Bearer DUMMY_TOKEN') {
    const user = await request.server.prisma.user.findFirst();
    if (user) {
      request.user = user;
      return;
    }
  }
  await request.jwtVerify();
});

// Close prisma on server close
fastify.addHook('onClose', async (instance) => {
  await instance.prisma.$disconnect();
});

// Register routes
fastify.register(authRoutes, { prefix: '/auth' });
fastify.register(deviceRoutes, { prefix: '/devices' });
fastify.register(sessionRoutes, { prefix: '/sessions' });
fastify.register(blocklistRoutes, { prefix: '/blocklists' });

// Serve Static Web Dashboard (Next.js Export)
let finalWebPath = path.join(__dirname, '../../web/out');
if (!fs.existsSync(finalWebPath)) {
  finalWebPath = path.join(__dirname, '../web/out'); // Try peer folder (prod)
}

console.log(`[BACKEND] Serving web assets from: ${finalWebPath}`);

fastify.register(fastifyStatic, {
  root: finalWebPath,
  prefix: '/',
});

// Fallback for SPA routing
fastify.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/auth') || request.url.startsWith('/devices') || request.url.startsWith('/sessions') || request.url.startsWith('/blocklists')) {
    return reply.status(404).send({ error: 'Not Found' });
  }
  return reply.sendFile('index.html');
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001');
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
