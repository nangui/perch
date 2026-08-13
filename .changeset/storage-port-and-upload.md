---
"@perchjs/core": minor
"@perchjs/nest": minor
---

Add the storage port, the `FileUpload` field, and the route that fills it.

Bytes go up when a file is chosen (ADR 0016), to a staging prefix, and the form
carries the key the adapter issued — so the resolution cycle never holds a file
and the trust boundary judges a handle. `.maxSize()` and `.acceptedFileTypes()`
are enforced on the route, because a page's own checks are gone the moment
somebody posts to it directly.

`@perchjs/nest` now declares `@nestjs/platform-express` as a peer dependency:
the upload route uses its file interceptor, and v0.1 is Express only.
