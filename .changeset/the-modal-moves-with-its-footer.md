---
"@perchjs/ui": patch
---

Move the modal into the styling config, and the form footer with it.

Thirty-two rules and 224 lines leave the hand-written sheet: the dialog, its ten declared widths and the window-sized one, the slide-over, the scrolling panel, the bar, the close button, the heading, the description, the actions — and both media queries, which are built-in conditions rather than nested at-rules now.

**The footer had to move with it, and that is the finding.** The modal overrides `.perch-form-actions` twice: a footer inside a dialog is already on a surface, so it drops its own card. That override is two classes against one, which specificity settles — but only while both sit in the same cascade origin. Moving the modal alone would have put its override in a layer and left the footer's own rule unlayered, and unlayered beats every layer however specific. The footer would have grown its card back inside every dialog, and nothing would have said so. The surfaces are two rules apart and entirely entangled: nothing but the modal reaches into the footer, and the footer reaches into nothing.

So the rule the migration has been following — move the zero-specificity floors a surface defers to — has a second half: **move the surfaces a surface overrides.** Probed by leaving the footer behind, and the guard names it.

The keyframes stay where they are, because an animation is global by name and no layer changes that. The rule that names it is generated and the frames it names are not, which is why the modal's own guard reads both halves now: one half alone checks an animation against no definition, or a definition against no animation, and passes either way.

Three fidelity checks: thirty-one of thirty-one selectors identical in their property sets, the coarse-pointer floor still after the base it overrides so it still wins, and the declared widths probed one at a time.

Nothing renamed, nothing published changed, the bundle unmoved and the stylesheet 13.09 kB gzip to 13.20.
