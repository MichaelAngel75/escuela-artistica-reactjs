type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler) {
  onUnauthorized = handler;
}

export async function apiFetch(
  input: RequestInfo,
  init: RequestInit = {},
): Promise<Response> {
  const res = await fetch(input, {
    credentials: "include",
    ...init,
  });

  if (res.status === 401 && onUnauthorized) {
    onUnauthorized();
  }

  return res;
}

export async function apiFetchJson<T>(
  input: RequestInfo,
  init: RequestInit = {},
): Promise<T> {
  const res = await apiFetch(input, init);

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(message || `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}
