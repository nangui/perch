# @perchjs/testing

Test helpers for [Perch](https://github.com/nangui/perch) panels.

Without helpers nobody tests their panel, and a regression in an admin screen
is invisible until somebody's data is wrong. These drive a panel the way a
browser does — through its own routes, its own resolution cycle and its own
trust boundary — so what a test proves is what a reader would get.

```ts
import { createPanelTest } from "@perchjs/testing";

const panel = await createPanelTest({ module: AdminModule, as: admin });

await panel
  .resource(UserResource)
  .form()
  .assertHasField("email")
  .fill({ countryId: 1 })
  .assertFieldVisible("cityId")
  .fill({ cityId: 2, email: "ada@example.com" })
  .submit()
  .assertNoErrors();

await panel.as(guest).resource(UserResource).assertForbidden();

await panel.close();
```

Nothing here reaches inside the panel. Every assertion is made against what
crossed the wire, which is the only thing a browser ever sees.
