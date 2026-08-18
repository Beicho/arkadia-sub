"use client";

export async function apiPost<T = { ok?: boolean }>(
  url: string,
  body?: unknown,
  method: "POST" | "PATCH" | "PUT" = "POST",
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `请求失败(${res.status})`);
  }
  return data;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `请求失败(${res.status})`);
  }
  return data;
}
