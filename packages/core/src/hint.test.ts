/**
 * The word beside the label, and the words inside the frame.
 *
 * Both are things a field says about itself that are not its value and not its
 * error. They are separated on purpose: the line under a control belongs to the
 * error, so an instruction living there is replaced by one exactly when the
 * reader needs to read both at once.
 */
import { describe, expect, it } from "vitest";
import type { Component } from "./component.js";
import { auditSchema } from "./audit.js";
import { Schema } from "./layout.js";
import { resolveSchema } from "./resolve.js";
import { serialise } from "./serialise.js";
import { TextInput } from "./fields/text-input.js";
import { Toggle } from "./fields/toggle.js";

const drawn = async (made: Component) =>
  serialise(await resolveSchema(Schema.make([made]), {}, { operation: "create" }))
    .schema.children?.[0];

describe("a hint", () => {
  it("crosses beside the label", async () => {
    const node = await drawn(TextInput.make("slug").hint("lowercase, no spaces"));

    expect(node?.hint).toBe("lowercase, no spaces");
    // Not the line under the control, which is the error's.
    expect(node?.helperText).toBeUndefined();
  });

  it("is resolved, so it may read the form around it", async () => {
    // The same rule every resolvable follows. Copying the function instead
    // would ship its source or nothing at all.
    const node = serialise(
      await resolveSchema(
        Schema.make([
          TextInput.make("last").hint(({ get }) => `matching ${String(get("first"))}`),
          TextInput.make("first"),
        ]),
        { first: "Ada" },
        { operation: "create" },
      ),
    ).schema.children?.[0];

    expect(node?.hint).toBe("matching Ada");
  });

  it("carries a glyph where one was asked for", async () => {
    const node = await drawn(
      TextInput.make("key").hint("kept secret").hintIcon("warning"),
    );

    expect(node?.hintIcon).toBe("warning");
  });

  it("belongs to any field, not only a line of text", async () => {
    expect((await drawn(Toggle.make("live").hint("takes effect at once")))?.hint).toBe(
      "takes effect at once",
    );
  });

  it("is absent where nobody asked for one", async () => {
    const node = await drawn(TextInput.make("slug"));

    expect(node?.hint).toBeUndefined();
    expect(node?.hintIcon).toBeUndefined();
  });
});

describe("an attribute a declaration asks for", () => {
  it("reaches the control where it describes it", async () => {
    const node = await drawn(
      TextInput.make("slug").extraAttributes({ "data-tour": "slug", title: "The URL" }),
    );

    expect(node?.extraAttributes).toEqual({ "data-tour": "slug", title: "The URL" });
  });

  it("stops the boot where it instructs a browser instead", () => {
    // The one option in this set that reaches the DOM as a name the author
    // chose. `on*` runs code, `style` is a stylesheet, and `href`, `src` and
    // `formaction` are addresses — all in the same namespace as `data-tour`.
    for (const name of ["onclick", "onFocus", "style", "href", "src", "formaction"]) {
      const complaints = auditSchema(
        Schema.make([TextInput.make("slug").extraAttributes({ [name]: "x" })]),
      );

      expect(complaints, name).toHaveLength(1);
      expect(complaints[0]?.problem, name).toContain(name);
    }
  });

  it("says nothing about the ones that describe", () => {
    expect(
      auditSchema(
        Schema.make([
          TextInput.make("slug").extraAttributes({
            "data-tour": "slug",
            "aria-keyshortcuts": "s",
            title: "The URL",
            role: "textbox",
          }),
        ]),
      ),
    ).toEqual([]);
  });

  it("is a clone away, like every other declaration", async () => {
    const plain = TextInput.make("slug");

    expect(
      (await drawn(plain.extraAttributes({ title: "x" })))?.extraAttributes,
    ).toEqual({ title: "x" });
    expect((await drawn(plain))?.extraAttributes).toBeUndefined();
  });
});

describe("autofocus", () => {
  it("crosses as the field declared it", async () => {
    expect((await drawn(TextInput.make("slug").autofocus()))?.autofocus).toBe(true);
    expect((await drawn(TextInput.make("slug")))?.autofocus).toBeUndefined();
  });
});

describe("an affix", () => {
  it("crosses as what sits inside the frame", async () => {
    const node = await drawn(
      TextInput.make("site").prefix("https://").suffix(".com").prefixIcon("link"),
    );

    expect(node?.props).toMatchObject({
      prefix: "https://",
      suffix: ".com",
      prefixIcon: "link",
    });
  });

  it("is not part of the value", async () => {
    // The column keeps what was typed. A field that wanted the affix stored
    // would say so in a `dehydrateStateUsing`, where the decision is visible.
    const result = await resolveSchema(
      Schema.make([TextInput.make("site").prefix("https://")]),
      { site: "example.com" },
      { operation: "create" },
    );

    expect(serialise(result).state["site"]).toBe("example.com");
  });

  it("is a clone away, like every other declaration", async () => {
    const plain = TextInput.make("site");
    const dressed = plain.prefix("https://");

    expect((await drawn(plain))?.props?.["prefix"]).toBeUndefined();
    expect((await drawn(dressed))?.props?.["prefix"]).toBe("https://");
  });
});
