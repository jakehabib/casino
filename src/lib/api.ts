import type { ApiErrorBody, ReasonCode } from './errors';
import { ReasonCopy } from './errors';

export class ApiError extends Error {
  constructor(
    public code: ReasonCode,
    message: string,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
  get title() {
    return ReasonCopy[this.code]?.title ?? 'Something went wrong';
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('INTERNAL', 'Connection lost — check your network and try again.', 0);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const err = (json as ApiErrorBody | null)?.error;
    const code = (err?.code ?? 'INTERNAL') as ReasonCode;
    const message = code === 'INTERNAL' ? ReasonCopy.INTERNAL.message : err?.message ?? ReasonCopy[code]?.message;
    throw new ApiError(code, message ?? 'Something went wrong', res.status, err?.details);
  }
  return json as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  patch: <T>(url: string, body: unknown = {}) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

/** Client-generated idempotency key for balance-changing requests. */
export function requestId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
  return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}
