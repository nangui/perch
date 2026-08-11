---
"@perchjs/ui": minor
"@perchjs/nest": minor
---

The list page draws the filters a table declared.

They share the search form, because a filter narrows the same query a search
does and one button should apply both. A control is drawn per declared filter,
by the label it was given, and a filter type the renderer has no meaning for is
skipped rather than guessed at — the rule the actions already follow.

`/records` answers with the filters it applied, by name, and the controls are
drawn from that rather than from what was entered. A name the server declined
or a value it capped must not sit in a box looking as though it worked, and a
filter dropped entirely leaves the address too — otherwise reloading asks for
it again and the address describes a table nobody was shown.

The form is a named landmark. An unnamed one is announced as "search" among
however many others a panel grows, and the name belongs to the region rather
than to any control in it.

A blank control is no filter rather than a filter matching nothing. Applying
starts over at page one; the filters survive a page turn.

Not here: the active-filter badge and `.deferFilters()` the design names, and
every filter type but `TextFilter`.
