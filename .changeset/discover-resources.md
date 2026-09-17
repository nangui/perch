---
"@perchjs/nest": minor
---

Add `discoverResources`, the second of the two ways a panel learns what it has. It takes a glob, loads what matches, and returns every class carrying `@PanelResource`, so a codebase where adding a resource should not also mean editing a module can stop editing the module. Listing them stays the recommendation: an array says what is in the panel where somebody reading it can see, and a bundler can drop what is not named. The two may be used together, and a class named both ways is one resource rather than two fighting over a URL. It is awaited, because loading a module is not a question an ESM runtime answers synchronously. And it refuses rather than returning nothing: a pattern that matches no files would otherwise serve a panel whose every page answers 404 for a reason no message would give, and when the pattern names TypeScript sources the refusal says so, since an application looks for those while running the JavaScript built from them.
