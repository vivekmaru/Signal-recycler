export function readSessionCookie(cookie: string | null) {
  return cookie?.match(/session=([^;]+)/)?.[1] ?? null;
}
