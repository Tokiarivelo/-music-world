import { z } from 'zod';

export interface ApiErrorDetail {
  loc: readonly (string | number)[];
  msg: string;
}

/** Error thrown by API calls; `code` is the stable API error code (or a client code such as `NETWORK`). */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    /** Field-level details of a validation error (`loc` is the path inside the request body). */
    readonly details: readonly ApiErrorDetail[] = [],
  ) {
    super(`API error ${code} (${status})`);
    this.name = 'ApiError';
  }
}

const DetailSchema = z.object({ loc: z.array(z.union([z.string(), z.number()])), msg: z.string() });
const ErrorBodySchema = z.object({
  error: z.object({ code: z.string(), details: z.array(z.unknown()).optional() }),
});

/** Reads the uniform `{ error: { code } }` body of a failed response. */
export async function apiErrorFrom(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = ErrorBodySchema.safeParse(body);
  if (!parsed.success) return new ApiError('UNKNOWN', response.status);
  const details = (parsed.data.error.details ?? []).flatMap((d) => {
    const detail = DetailSchema.safeParse(d);
    return detail.success ? [detail.data] : [];
  });
  return new ApiError(parsed.data.error.code, response.status, details);
}
