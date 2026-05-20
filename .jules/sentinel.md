## 2026-05-20 - Overly permissive CORS configuration
**Vulnerability:** Fastify CORS plugin was configured with `{ origin: true }`, which allows any origin to make cross-origin requests to the API.
**Learning:** This is a common default that developers use during early development but forget to lock down before production.
**Prevention:** Always specify explicitly allowed origins or a restrictive regular expression for CORS when configuring APIs meant to be consumed by specific frontends.
