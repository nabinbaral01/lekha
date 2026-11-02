import { z, ZodTypeAny } from 'zod';
import { parseAmount, parseBs } from '@pa/core';
import { AppError } from './errors';

export function parse<S extends ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new AppError('VALIDATION', {}, 400, r.error.issues.map((i) => ({ code: i.message.startsWith('E_') ? i.message.slice(2) : 'FIELD_INVALID', params: { field: i.path.join('.') } })));
  }
  return r.data;
}

/** Rupee amount string/number -> bigint paisa. */
export const zAmount = z.union([z.string(), z.number()]).transform((v, ctx) => {
  try {
    return parseAmount(v);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'E_AMOUNT_INVALID' });
    return z.NEVER;
  }
});
export const zPositiveAmount = zAmount.refine((v) => v > 0n, 'E_AMOUNT_POSITIVE');

export const zBsDate = z.string().refine((s) => {
  try {
    parseBs(s);
    return true;
  } catch {
    return false;
  }
}, 'E_DATE_INVALID');
