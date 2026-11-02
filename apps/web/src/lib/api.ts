/** Thin fetch wrapper. Server errors arrive as { code, params, issues } and are translated in the UI. */
export interface Issue {
  code: string;
  line?: number;
  params?: Record<string, string>;
}
export class ApiError extends Error {
  constructor(public status: number, public code: string, public params: Record<string, string> = {}, public issues: Issue[] = []) {
    super(code);
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      credentials: 'same-origin',
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && data?.code === 'SESSION_EXPIRED') onUnauthorized();
    throw new ApiError(res.status, data?.code ?? 'ERROR', data?.params ?? {}, data?.issues ?? []);
  }
  return data as T;
}

export const post = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const put = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'PUT', body });
export const patch = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'PATCH', body });
