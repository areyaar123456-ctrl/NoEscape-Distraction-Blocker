import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';

const startSessionSchema = z.object({
    duration_minutes: z.number().min(1),
    locked_mode: z.boolean().optional(),
    blocklist_id: z.string().optional().nullable(),
});

export async function sessionRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', fastify.authenticate);

    fastify.post('/start', async (request: any, reply) => {
        try {
            console.log(`[BACKEND_SESS] Start attempt for User ${request.user.id}:`, request.body);
            const body = startSessionSchema.parse(request.body);
            const user_id = request.user.id;

            // Check for active sessions
            const activeSession = await prisma.session.findFirst({
                where: { user_id, active: true, end_time: { gt: new Date() } }
            });

            if (activeSession) {
                console.log(`[BACKEND_SESS] Active session already exists for User ${user_id}`);
                return reply.status(400).send({ error: 'A session is already active' });
            }

            const start_time = new Date();
            const end_time = new Date(start_time.getTime() + body.duration_minutes * 60000);

            const session = await prisma.session.create({
                data: {
                    user_id,
                    blocklist_id: body.blocklist_id || null,
                    start_time,
                    end_time,
                    locked_mode: body.locked_mode || false,
                    active: true,
                },
                include: {
                    blocklist: {
                        include: {
                            blocked_domains: true,
                            blocked_apps: true,
                        }
                    }
                }
            });

            console.log(`[BACKEND_SESS] Session started: ${session.id}`);
            return session;
        } catch (err: any) {
            console.error('[BACKEND_SESS_ERROR] Failed to start:', err);
            if (err instanceof z.ZodError) {
                return reply.status(400).send({ error: `VALIDATION_FAILED: ${JSON.stringify(err.issues)}` });
            }
            return reply.status(500).send({ error: `CRITICAL_START_ERR: ${err.message}` });
        }
    });

    fastify.post('/end', async (request: any, reply) => {
        const user_id = request.user.id;

        const session = await prisma.session.findFirst({
            where: { user_id, active: true }
        });

        if (!session) return reply.status(404).send({ error: 'No active session found' });

        if (session.locked_mode && session.end_time > new Date()) {
            return reply.status(403).send({ error: 'Cannot end a locked session early' });
        }

        const updated = await prisma.session.update({
            where: { id: session.id },
            data: { active: false }
        });

        return updated;
    });

    fastify.get('/active', async (request: any, reply) => {
        const session = await prisma.session.findFirst({
            where: { user_id: request.user.id, active: true, end_time: { gt: new Date() } },
            include: {
                blocklist: {
                    include: {
                        blocked_domains: true,
                        blocked_apps: true,
                    }
                }
            }
        });
        return session || { active: false };
    });

    // Get session history
    fastify.get('/history', async (request: any, reply) => {
        try {
            console.log(`[BACKEND_SESS] Fetching history for User ${request.user.id}`);
            const history = await prisma.session.findMany({
                where: {
                    user_id: request.user.id,
                    OR: [
                        { active: false },
                        { end_time: { lte: new Date() } }
                    ]
                },
                include: {
                    blocklist: true
                },
                orderBy: {
                    start_time: 'desc'
                },
                take: 20
            });
            console.log(`[BACKEND_SESS] Found ${history.length} history items.`);
            return history;
        } catch (err: any) {
            console.error('[BACKEND_SESS_ERROR] History fetch failed:', err.message);
            return reply.status(500).send({ error: 'Failed to fetch history', message: err.message });
        }
    });
}
