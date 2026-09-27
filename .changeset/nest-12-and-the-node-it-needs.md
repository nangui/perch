---
"@perchjs/nest": minor
"@perchjs/testing": minor
---

Support NestJS 12, and ask for the Node that makes it loadable. The twelfth major publishes every `@nestjs/*` package as ESM only, and these two ship a CommonJS bundle that requires three of them — the shape that breaks when a dependency goes ESM only. Measured rather than assumed: the whole suite passes against 12.1.0 with nothing changed, `require()` of an ESM-only `@nestjs/common` works, and `require()` and `import()` of it return the same instance, which is what keeps one copy of the injection tokens rather than two. The peer ranges now name both majors.

What that costs is a floor on Node. `require()` of an ES module landed in 22.12: on 22.11 it is `ERR_REQUIRE_ESM`, on 22.12 it works and warns on every load, and from 24 it is silent. All three were run. So `engines` moves from `>=22` to `>=22.12` on these two packages and stays where it is on the other five, which reach no ESM-only dependency and would be refused installs that work.

CI runs both halves of the range rather than advertising one it does not build. The lockfile holds one major, and has to, so the second leg writes an override and resolves it; the legs do not cancel each other, a pass on one and a failure on the other being the answer to which major broke. Breaking under the rule that a minor before 1.0 is breaking: an application on Node 22.0 through 22.11 installed these yesterday and does not today.
