export function middleware(request: Request) {
  const cookie = request.headers.get("cookie");
  if (!cookie?.includes("session=")) {
    return new Response("Unauthorized", { status: 401 });
  }
  return new Response("OK");
}
