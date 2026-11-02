import { HttpException, HttpStatus } from '@nestjs/common';
import type { ValidationIssue } from '@pa/core';

/**
 * Business-rule error. `code` is an i18n key on the client (errors.<code>) so the
 * message appears in the user's language with instructions on how to fix it.
 */
export class AppError extends HttpException {
  constructor(code: string, params: Record<string, string> = {}, status = HttpStatus.BAD_REQUEST, issues: ValidationIssue[] = []) {
    super({ code, params, issues }, status);
  }
}

export const Forbidden = (code = 'FORBIDDEN') => new AppError(code, {}, HttpStatus.FORBIDDEN);
export const NotFound = (code = 'NOT_FOUND') => new AppError(code, {}, HttpStatus.NOT_FOUND);
export const Conflict = (code: string, params: Record<string, string> = {}) => new AppError(code, params, HttpStatus.CONFLICT);
