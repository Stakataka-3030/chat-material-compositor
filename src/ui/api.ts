let token = "";
export function setClientToken(value: string) {
  token = value;
}
async function fetchResponse(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.method && options.method !== "GET")
    headers.set("x-liaomu-client", token);
  if (typeof options.body === "string")
    headers.set("content-type", "application/json");
  let response = await fetch(url, {
    ...options,
    headers,
    signal: options.signal ?? AbortSignal.timeout(45000),
  });
  if (response.status === 403 && token) {
    const boot = (await fetch("/api/bootstrap").then((r) => r.json())) as {
      clientToken?: string;
    };
    if (boot.clientToken) {
      token = boot.clientToken;
      headers.set("x-liaomu-client", token);
      response = await fetch(url, {
        ...options,
        headers,
        signal: options.signal ?? AbortSignal.timeout(45000),
      });
    }
  }
  return response;
}
export async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetchResponse(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "操作未完成");
  return data as T;
}
export async function download(url: string, body: unknown, filename: string) {
  const response = await fetchResponse(url, {
    method: "POST",
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok)
    throw new Error((await response.json()).error || "导出未完成");
  const blob = await response.blob(),
    objectUrl = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
}
export const post = <T>(url: string, body: unknown) =>
  request<T>(url, { method: "POST", body: JSON.stringify(body) });
