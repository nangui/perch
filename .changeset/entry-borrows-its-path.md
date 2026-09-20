---
"@perchjs/ui": patch
---

Let an entry fall back to its path for a name, the way a field in the same position already does and the way a column already does in its heading. `TextEntry.make("family")` drew a value with nothing beside it while `TextInput.make("family")` drew `FAMILY` above the box: the same declaration read two ways, and the difference was not a decision anybody had made. The copy button borrows the same name, so a page of several no longer offers several buttons that all say "Copy". `.label("")` still means no name, an empty string being a name a resource chose rather than the absence of one. Not for `RepeatableEntry`, whose label is the heading of a group rather than the name of a value.
