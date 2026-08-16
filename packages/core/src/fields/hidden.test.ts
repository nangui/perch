import { describe, expect, it } from "vitest";
import { auditSchema } from "../audit.js";
import { Schema } from "../layout.js";
import { dehydrate, resolveSchema } from "../resolve.js";
import { sanitize } from "../sanitize.js";
import { serialise } from "../serialise.js";
import { Hidden } from "./hidden.js";
import { TextInput } from "./text-input.js";

const SCHEMA = Schema.make([
  TextInput.make("title"),
  Hidden.make("authorId").default(7),
]);

const full = (state: Record<string, unknown> = {}) =>
  resolveSchema(SCHEMA, state, { operation: "create" });

describe("what a client may do to it", () => {
  it("nothing, and not because a flag said so", async () => {
    // The oldest hole there is: `authorId` in a hidden input, rewritten in the
    // console, saved as somebody else's row.
    const clean = sanitize(await full(), { authorId: 999 });

    expect(clean.state).toEqual({});
    expect(clean.rejected).toEqual([{ path: "authorId", reason: "server-owned" }]);
  });

  it("is refused even where the form left it visible and writable", async () => {
    // `disabled` and `readOnly` are resolvable, so a field relying on one would
    // be unlocked by the resolver that was meant to lock it.
    const unlocked = Schema.make([
      Hidden.make("authorId").disabled(false).readOnly(false),
    ]);
    const tree = await resolveSchema(unlocked, {}, { operation: "create" });

    expect(sanitize(tree, { authorId: 999 }).rejected).toEqual([
      { path: "authorId", reason: "server-owned" },
    ]);
  });
});

describe("what survives to the database", () => {
  it("the server's value, after the client tried another", async () => {
    const clean = sanitize(await full(), { title: "Ada", authorId: 999 });
    const settled = await full(clean.state);

    expect(dehydrate(settled, { operation: "create" }).set).toEqual({
      title: "Ada",
      authorId: 7,
    });
  });

  it("the row's own value on an edit, through the boundary a save goes through", async () => {
    // The client's echo is refused, so unless the row is consulted the default
    // arrives at the write and overwrites the column on every save. Injecting
    // the state directly, as this test used to, took a path no save takes and
    // passed for the wrong reason.
    const record = { authorId: 2 };
    const rendered = await resolveSchema(SCHEMA, {}, { operation: "edit", record });

    const clean = sanitize(rendered, { title: "Ada", authorId: 999 });
    const settled = await resolveSchema(SCHEMA, clean.state, {
      operation: "edit",
      record,
    });

    expect(dehydrate(settled, { operation: "edit", record }).set["authorId"]).toBe(2);
  });

  it("a default only where there is no row to ask", async () => {
    const settled = await resolveSchema(SCHEMA, {}, { operation: "create" });

    expect(dehydrate(settled, { operation: "create" }).set["authorId"]).toBe(7);
  });
});

describe("on the wire", () => {
  it("keeps its value back from the browser entirely", async () => {
    // "Hidden" names where a thing is drawn, never who may read it: a value in
    // `data-payload` is a value in the page source. Nothing is lost by
    // withholding it, because the server derives it again on every pass.
    const payload = serialise(await full());

    expect(payload.state).not.toHaveProperty("authorId");
    expect(payload.state["title"]).toBeUndefined();
  });

  it("does not withhold a disabled field's value, which is read and not set", async () => {
    // The two refusals are different questions. A disabled field takes no
    // incoming state and its value is exactly what the reader must keep seeing.
    const locked = Schema.make([TextInput.make("reference").disabled().default("R-1")]);
    const payload = serialise(await resolveSchema(locked, {}, { operation: "create" }));

    expect(payload.state["reference"]).toBe("R-1");
  });

  it("carries a node, so the renderer can decide to draw nothing", async () => {
    const payload = serialise(await full());

    expect(payload.schema.children?.map((child) => child.type)).toEqual([
      "TextInput",
      "Hidden",
    ]);
  });
});

describe("a live exchange, where nothing is hydrated", () => {
  it("keeps the value it already had rather than dropping it", async () => {
    // A patch resolves with a `dirtyPath`, which skips the pass that fills
    // blanks from `default()`. The value has to come along in the state.
    const first = await full();
    const next = await resolveSchema(
      SCHEMA,
      { ...first.state, title: "Ad" },
      { operation: "create", dirtyPath: "title", previous: first },
    );

    expect(next.state["authorId"]).toBe(7);
  });
});

describe("a hidden field with no source", () => {
  it("stops the boot, because a create would write nothing for it", () => {
    // Its two sources are the row and `default()`. Without either, a NOT NULL
    // column raises from the driver and a nullable one takes a silent null —
    // a `tenantId` that surfaces as a bug much later.
    expect(auditSchema(Schema.make([Hidden.make("tenantId")]))).toEqual([
      {
        field: "tenantId",
        problem:
          "has no default, and a hidden field takes its value from the row or " +
          "from one — so a create would write nothing for it",
      },
    ]);
  });

  it("says nothing once it has one", () => {
    expect(auditSchema(Schema.make([Hidden.make("tenantId").default(1)]))).toEqual([]);
  });

  it("stays quiet where a hook could be filling it", () => {
    // What a hook sets is opaque from the audit, and a boot that stops a working
    // form is worse than one that misses a broken form. Certain, not probable.
    const withHook = Schema.make([
      TextInput.make("title").afterStateUpdated(({ set }) => {
        set("slug", "computed");
      }),
      Hidden.make("slug"),
    ]);

    expect(auditSchema(withHook)).toEqual([]);
  });
});
