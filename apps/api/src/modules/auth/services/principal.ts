import type { FastifyRequest } from 'fastify';
import type { AccountRole } from '@cenit/contracts/auth';

export type Principal = { accountId: string; role: AccountRole };
export type Authenticate = (request: FastifyRequest) => Promise<Principal | null>;
