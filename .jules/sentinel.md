## 2025-02-18 - [Restrict CORS for Local API]
**Vulnerability:** Overly permissive CORS configuration (`origin: true`) in the local API allows any website to make cross-origin requests.
**Learning:** Local APIs should restrict CORS to specific trusted origins (like localhost or specific dashboard URLs) to prevent malicious websites from interacting with them on behalf of the user.
**Prevention:** Always specify an exact list of allowed origins instead of using `origin: true` or `*`.
