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

await panel
  .resource(UserResource)
  .table()
  .assertCanSeeRecords([ada, grace])
  .filter("role", "admin")
  .assertCanSeeRecords([ada])
  // The N+1 guardrail: a relation drawn in a column has to arrive with the
  // rows, and a table that fetched one per row still looks correct on screen.
  .assertQueryCount(2);

await panel
  .resource(PostResource)
  .action("archive", post)
  .assertVisible()
  .call({ reason: "obsolete" })
  .assertProcessed(1)
  .assertNotification("success", "Post archived");

await panel.as(guest).resource(UserResource).assertForbidden();

await panel.close();
```

An action being offered is not an action being permitted — a hidden button was
never the protection, so `assertVisible` says what the table draws and
`assertRefused` says what the server did about it.

Nothing here reaches inside the panel. Every assertion is made against what
crossed the wire, which is the only thing a browser ever sees.
