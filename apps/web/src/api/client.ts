import type { SSEEvent } from "./types";
import { useAuthStore } from "../store/auth";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token;
  const resp = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
  });
  if (resp.status === 401) {
    useAuthStore.getState().logout();
    throw new ApiError(401, "登录已过期，请重新登录");
  }
  if (!resp.ok) {
    let detail = `请求失败（${resp.status}）`;
    try {
      const body = await resp.json();
      if (body.detail) detail = body.detail;
    } catch {
      /* 忽略非 JSON 错误体 */
    }
    throw new ApiError(resp.status, detail);
  }
  return resp.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
};

/** 逐帧解析 SSE 流（POST + ReadableStream）。返回时保证流已结束。 */
export async function streamAsk(
  conversationId: string,
  question: string,
  datasourceId: string | null,
  onEvent: (event: SSEEvent) => void
): Promise<void> {
  const token = useAuthStore.getState().token;
  const resp = await fetch(`/api/conversations/${conversationId}/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      question,
      ...(datasourceId ? { datasource_id: datasourceId } : {}),
    }),
  });
  if (!resp.ok || !resp.body) {
    let detail = `请求失败（${resp.status}）`;
    try {
      detail = (await resp.json()).detail ?? detail;
    } catch {
      /* keep default */
    }
    throw new ApiError(resp.status, detail);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith("data:")) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as SSEEvent);
      } catch {
        /* 跳过不完整帧 */
      }
    }
  }
}
