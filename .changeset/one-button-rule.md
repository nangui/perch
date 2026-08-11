---
"@perchjs/ui": patch
---

Every button variant looks like itself again.

`.perch-button` was declared twice: the list page added a second, accent
coloured block below the first, and equal specificity meant the later one won.
Every button in the panel therefore rendered identically — accent background,
inverse text — and `--primary`, `--icon` and `--danger` set colours that
nothing ever showed. The repeater's remove button was not red; its arrows were
not compact.

The duplicate is gone. The one thing it carried that the base did not —
`text-decoration: none`, for the create action, which is an anchor — moves onto
the base rule, and that action now asks for `--primary`, which is what it was
borrowing the colour of.

A plain button is neutral again, primary is accent, an icon button is muted and
compact, a danger button is red. A test resolves the cascade for each variant,
because nothing in the suite noticed any of this: it passed throughout, and
passed again after the whole panel changed colour.
