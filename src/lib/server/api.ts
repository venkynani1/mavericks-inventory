import "server-only"

/** Every API error has the same shape: { "error": { "code": "NOT_FOUND", "message": "…" } } */
export function apiError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status })
}

export const unauthorized = () => apiError(401, "UNAUTHENTICATED", "Sign in to continue.")
export const forbidden = () => apiError(403, "FORBIDDEN", "Your role doesn't allow this.")
export const notFound = (what = "Record") => apiError(404, "NOT_FOUND", `${what} not found.`)

export function codeFor(status: number) {
  return { 400: "INVALID_INPUT", 401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT" }[status] ?? "ERROR"
}
