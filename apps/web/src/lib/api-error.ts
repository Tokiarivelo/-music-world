import { z } from 'zod';

/** Error thrown by API calls; `code` is the stable API error code (or a client code such as `NETWORK`). */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(`API error ${code} (${status})`);
    this.name = 'ApiError';
  }
}

const ErrorBodySchema = z.object({ error: z.object({ code: z.string() }) });

/** Reads the uniform `{ error: { code } }` body of a failed response. */
export async function apiErrorFrom(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = ErrorBodySchema.safeParse(body);
  return new ApiError(parsed.success ? parsed.data.error.code : 'UNKNOWN', response.status);
}
