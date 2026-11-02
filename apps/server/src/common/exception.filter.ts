import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/** Every error leaves the server as { code, params, issues } so the client can translate it. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Error');

  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (err instanceof HttpException) {
      const body = err.getResponse();
      const status = err.getStatus();
      if (typeof body === 'object' && body && 'code' in body) return res.status(status).json(body);
      const code = status === 404 ? 'NOT_FOUND' : status === 403 ? 'FORBIDDEN' : status === 401 ? 'SESSION_EXPIRED' : status === 400 ? 'VALIDATION' : 'ERROR';
      return res.status(status).json({ code, params: {}, issues: [] });
    }
    // Database stopped / unreachable: say so plainly instead of a generic server error.
    const dbDown =
      err instanceof Prisma.PrismaClientInitializationError ||
      (err instanceof Prisma.PrismaClientKnownRequestError && ['P1001', 'P1002', 'P1017'].includes(err.code)) ||
      (err instanceof Prisma.PrismaClientUnknownRequestError && /starting up|shutting down|terminat|ECONNRE|closed the connection|connect/i.test(err.message));
    if (dbDown) {
      this.log.error(`Database unreachable: ${err.message.split('\n').pop()}`);
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ code: 'DATABASE_DOWN', params: {}, issues: [] });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') return res.status(HttpStatus.CONFLICT).json({ code: 'DUPLICATE', params: {}, issues: [] });
      if (err.code === 'P2025') return res.status(HttpStatus.NOT_FOUND).json({ code: 'NOT_FOUND', params: {}, issues: [] });
    }
    this.log.error(err instanceof Error ? err.stack : String(err));
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 'INTERNAL', params: {}, issues: [] });
  }
}
