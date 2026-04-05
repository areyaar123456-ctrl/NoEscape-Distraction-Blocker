import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';

const registerSchema = z.object({
    email: z.string(),
    password: z.string().min(8),
});

const loginSchema = z.object({
    email: z.string(),
    password: z.string(),
});

export async function authRoutes(fastify: FastifyInstance) {
    fastify.post('/register', async (request, reply) => {
        try {
            console.log('Register request received:', request.body);
            const body = registerSchema.parse(request.body);

            const existingUser = await prisma.user.findUnique({ where: { email: body.email } });
            if (existingUser) return reply.status(400).send({ error: 'Email already exists' });

            const password_hash = await bcrypt.hash(body.password, 10);
            const user = await prisma.user.create({
                data: { email: body.email, password_hash }
            });

            const token = fastify.jwt.sign({ id: user.id, email: user.email });
            console.log('Registration successful for:', user.email);
            return { token, user: { id: user.id, email: user.email } };
        } catch (err: any) {
            console.error('Registration error detail:', err);
            if (err instanceof z.ZodError) {
                return reply.status(400).send({ error: 'Validation failed', detail: err.issues });
            }
            return reply.status(500).send({ error: err.message || 'Registration failed' });
        }
    });

    fastify.post('/login', async (request, reply) => {
        try {
            console.log('[BACKEND_AUTH] Login attempt for:', (request.body as any)?.email);
            const body = loginSchema.parse(request.body);

            let user = await prisma.user.findUnique({ where: { email: body.email } });

            if (!user) {
                console.log('[BACKEND_AUTH] User not found, auto-registering:', body.email);
                const password_hash = await bcrypt.hash(body.password, 10);
                user = await prisma.user.create({
                    data: { email: body.email, password_hash }
                });
            }

            const valid = await bcrypt.compare(body.password, user.password_hash);
            if (!valid) {
                console.log('[BACKEND_AUTH] Password mismatch for:', body.email);
                return reply.status(401).send({ error: 'Invalid credentials' });
            }

            const token = fastify.jwt.sign({ id: user.id, email: user.email });
            console.log('[BACKEND_AUTH] Login successful for:', user.email);
            return { token, user: { id: user.id, email: user.email } };
        } catch (err: any) {
            console.error('[BACKEND_AUTH_ERROR] Login failed:', err);
            if (err instanceof z.ZodError) {
                return reply.status(400).send({ error: 'Validation failed', detail: err.issues });
            }
            return reply.status(500).send({ error: 'Internal Server Error', message: err.message });
        }
    });
}
