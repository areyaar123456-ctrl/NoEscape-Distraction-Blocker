import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';

const registerDeviceSchema = z.object({
    device_name: z.string(),
    os_type: z.string(),
    public_key: z.string(),
});

export async function deviceRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', fastify.authenticate);

    fastify.post('/register', async (request: any, reply) => {
        const body = registerDeviceSchema.parse(request.body);
        const user_id = request.user.id;

        const device = await prisma.device.create({
            data: {
                user_id,
                device_name: body.device_name,
                os_type: body.os_type,
                public_key: body.public_key,
            },
        });

        return { device_token: device.device_token, id: device.id };
    });

    fastify.get('/', async (request: any, reply) => {
        return prisma.device.findMany({ where: { user_id: request.user.id } });
    });
}
