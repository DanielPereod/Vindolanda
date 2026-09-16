import { useQuery } from "@tanstack/react-query";
/** HTTP failures preserve the status for authentication and validation handling. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
/** Uses same-origin cookies. Callers specify their expected API response contract. */
export async function api<Value>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<Value> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const problem: unknown = await response.json().catch(() => null);
    const message =
      typeof problem === "object" &&
      problem !== null &&
      "error" in problem &&
      typeof problem.error === "string"
        ? problem.error
        : "No se pudo completar la operación";
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as Value;
  return response.json() as Promise<Value>;
}
export function useResource<Value>(path: string) {
  return useQuery({ queryKey: [path], queryFn: () => api<Value>(path) });
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ha ocurrido un error";
}
