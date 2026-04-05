import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';

const createBlocklistSchema = z.object({
    name: z.string(),
    domains: z.array(z.string()).optional(),
    apps: z.array(z.string()).optional(),
});

export async function blocklistRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', fastify.authenticate);

    // Basic Logging Hook
    fastify.addHook('onRequest', async (request, reply) => {
        console.log(`[BACKEND_REQUEST] ${request.method} ${request.url}`);
    });

    fastify.post('/', async (request: any, reply) => {
        console.log(`[BACKEND] Creating blocklist for user ${request.user.id}:`, request.body);
        const body = createBlocklistSchema.parse(request.body);
        const user_id = request.user.id;

        try {
            const blocklist = await prisma.blocklist.create({
                data: {
                    user_id,
                    name: body.name,
                    blocked_domains: {
                        create: body.domains?.map(domain => ({ domain })) || []
                    },
                    blocked_apps: {
                        create: body.apps?.map(process_name => ({ process_name })) || []
                    }
                },
                include: {
                    blocked_domains: true,
                    blocked_apps: true,
                }
            });
            console.log(`[BACKEND] Blocklist created: ${blocklist.id}`);
            return blocklist;
        } catch (err) {
            console.error('[BACKEND_ERROR] Failed to create blocklist:', err);
            throw err;
        }
    });

    fastify.get('/', async (request: any, reply) => {
        try {
            console.log(`[BACKEND_LIST] Fetching blocklists for User: ${request.user.id}`);
            const list = await prisma.blocklist.findMany({
                where: { user_id: request.user.id },
                include: {
                    blocked_domains: true,
                    blocked_apps: true,
                }
            });
            console.log(`[BACKEND_LIST] Found ${list.length} items.`);
            return list;
        } catch (err: any) {
            console.error('[BACKEND_LIST_ERROR]', err.message);
            return reply.status(500).send({ error: 'Failed to fetch blocklists', message: err.message });
        }
    });

    fastify.delete('/:id', async (request: any, reply) => {
        const { id } = request.params as { id: string };
        await prisma.blocklist.deleteMany({
            where: { id, user_id: request.user.id }
        });
        return { success: true };
    });
}
