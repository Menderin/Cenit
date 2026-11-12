import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ErrorResponseSchema } from '@cenit/contracts';
import { ServiceCommissionErrorsSchema, ServiceCommissionSchema, type ServiceCommission } from '@cenit/contracts/personnel';
import type { Authenticate } from '../../auth/services/principal.js';
import { ApiError } from '../../../infrastructure/errors.js';
import { commissionPdf } from '../services/pdf.js';
import { validateCommission } from '../services/validation.js';

export async function personnelRoutes(app: FastifyInstance, options: { authenticate: Authenticate; allowedOrigins: string[] }) {
  const access = async (request: FastifyRequest) => {
    const principal = await options.authenticate(request);
    if (!principal) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Debes iniciar sesión.');
    if (principal.role !== 'administrativo') throw new ApiError(403, 'FORBIDDEN', 'No tienes acceso a este recurso.');
    if (!request.headers.origin || !options.allowedOrigins.includes(request.headers.origin)) throw new ApiError(403, 'FORBIDDEN', 'Origen no autorizado.');
  };
  const errors = Object.fromEntries([400, 401, 403, 413, 500, 503].map(status => [status, ErrorResponseSchema]));
  app.post<{ Body: ServiceCommission }>('/service-commissions/pdf', {
    onRequest: access,
    schema: { body: ServiceCommissionSchema, response: { ...errors, 422: ServiceCommissionErrorsSchema } },
  }, async (request, reply) => {
    let fields = validateCommission(request.body);
    let bytes: Uint8Array | undefined;
    if (!Object.keys(fields).length) ({ bytes, fields } = await commissionPdf(request.body));
    if (Object.keys(fields).length) return reply.code(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Revisa los campos indicados.', requestId: request.id, fields } });
    return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', 'attachment; filename="comision-servicios.pdf"').header('Cache-Control', 'no-store').send(Buffer.from(bytes!));
  });
}
