
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured.");
  }

  const headers = new Headers(options.headers);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const normalizedPath = path.replace(/^\/+/, "");

  const response = await fetch(
    `${API_BASE_URL}/${normalizedPath}`,
    {
      ...options,
      headers,
    },
  );

  const responseText = await response.text();
  let data: unknown = null;

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = responseText;
    }
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    if (typeof data === "object" && data !== null && "message" in data) {
      const apiMessage = data.message;

      if (typeof apiMessage === "string") {
        message = apiMessage;
      } else if (Array.isArray(apiMessage)) {
        message = apiMessage.join(", ");
      }
    }

    throw new Error(message);
  }

  return data as T;
}
