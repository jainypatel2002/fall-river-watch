export async function jsonFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const rawBody = await response.text();
  let payload: unknown = {};

  if (rawBody.length) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = { raw: rawBody };
    }
  }

  if (!response.ok) {
    const jsonPayload = payload as { error?: string; raw?: string };
    const message = jsonPayload?.error ?? jsonPayload?.raw ?? "Request failed";
    const error = new Error(message) as Error & { status?: number; payload?: unknown };
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload as T;
}
