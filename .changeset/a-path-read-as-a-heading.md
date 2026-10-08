---
"@perchjs/core": patch
"@perchjs/nest": patch
"@perchjs/ui": patch
---

Read a path as a heading where nothing named it.

A field, column or entry with no label printed its path exactly as written. A table headed `Species | Site | count | certainty` and a form asked for `name`, `region`, `habitat`, the lower-case ones being paths. It is what makes a panel look unfinished in a way no styling reaches.

The project already had the function: `titled()` turns a path into a heading and the page titles used it, in two copies that handled hyphens only, while twenty-four places in the renderer printed the path raw. One reading of it now, handling what a path is actually written in — `commonName`, `common_name`, `import-orders`. A dotted path keeps its segments, so `site.name` is `Site name` rather than `Name` and a table holding it beside `observer.name` does not head two columns alike.

A label that was given is untouched, including an empty one: absence falls back, emptiness is a resource saying it wants no label.

The renderer keeps its own copy rather than importing the domain's, because core is a development dependency of `@perchjs/ui` and a value taken from it would compile and then fail for whoever installs the renderer. A test compares the two over the same paths, which the boundary rule exempts.
