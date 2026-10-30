export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw new Error(
      "The Source & Story API is unreachable. Start or restart the Python server with `python -m backend.app` from the project folder, then retry. If it is already running, check its terminal for startup errors.",
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

export const post = (path, body) => api(path, {
  method: "POST",
  body: JSON.stringify(body),
});

export function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
