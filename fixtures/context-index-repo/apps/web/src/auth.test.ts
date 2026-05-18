import { readSessionCookie } from "./auth";

test("reads session cookie", () => {
  expect(readSessionCookie("session=abc")).toBe("abc");
});
