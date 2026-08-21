/**
 * A list the reader writes, and the two shapes a column keeps it in.
 *
 * The open counterpart of a checkbox list: both hold several values and only
 * one of them has a set to be measured against. What is refused here is what no
 * page could have produced.
 */
import { describe, expect, it } from "vitest";
import { auditSchema } from "../audit.js";
import { Schema } from "../layout.js";
import { dehydrate, resolveSchema } from "../resolve.js";
import { sanitize } from "../sanitize.js";
import { serialise } from "../serialise.js";
import { TagsInput } from "./tags-input.js";

const tree = (made = TagsInput.make("tags"), state: Record<string, unknown> = {}) =>
  resolveSchema(Schema.make([made]), state, { operation: "create" });

const refusal = async (value: unknown, made?: TagsInput) =>
  sanitize(await tree(made), { tags: value }).rejected[0]?.reason;

describe("what a tags input may hold", () => {
  it("whatever the reader typed, because nothing declares the members", async () => {
    expect(sanitize(await tree(), { tags: ["ada", "compilers"] }).state).toEqual({
      tags: ["ada", "compilers"],
    });
  });

  it("an empty list, which is a reader clearing it", async () => {
    expect(sanitize(await tree(), { tags: [] }).state).toEqual({ tags: [] });
  });

  it("a tag that happens to look like a suggestion, and one that does not", async () => {
    // Suggestions are proposals. Measuring against them would be a closed set
    // with extra steps, and the field for a closed set is already written.
    const suggested = TagsInput.make("tags").suggestions(["ada"]);

    expect(sanitize(await tree(suggested), { tags: ["ada", "grace"] }).state).toEqual({
      tags: ["ada", "grace"],
    });
  });

  it("nothing that is not a list", async () => {
    expect(await refusal("ada")).toBe("wrong-shape");
    expect(await refusal({ ada: true })).toBe("wrong-shape");
  });

  it("nothing that is not text inside it", async () => {
    expect(await refusal([1])).toBe("wrong-shape");
    expect(await refusal([["ada"]])).toBe("wrong-shape");
  });

  it("no blank tag, which is one nobody typed on purpose", async () => {
    expect(await refusal([""])).toBe("wrong-shape");
    expect(await refusal(["   "])).toBe("wrong-shape");
  });

  it("nothing twice, which no page can produce", async () => {
    expect(await refusal(["ada", "ada"])).toBe("wrong-shape");
  });

  it("nothing with space around it, which the box would have trimmed", async () => {
    // The two halves have to agree on what a tag is, or the honest path and
    // the boundary answer differently and the second one is never seen.
    expect(await refusal([" ada"])).toBe("wrong-shape");
    expect(await refusal(["ada "])).toBe("wrong-shape");
  });
});

describe("a column somebody else filled", () => {
  const joined = () => TagsInput.make("tags").separator(",");

  const read = async (stored: unknown) =>
    serialise(
      await resolveSchema(
        Schema.make([joined()]),
        { tags: stored },
        { operation: "edit", record: { tags: stored } },
      ),
    ).state["tags"];

  it("is read as the tags it means, not as what splitting gives", async () => {
    // A trailing separator, two in a row, a space after each one: all three
    // are shapes a column holds and none is what this field would have
    // written. Split naively they give a blank tag, which the boundary
    // refuses — a form that cannot be saved until the reader notices.
    expect(await read("ada,grace,")).toEqual(["ada", "grace"]);
    expect(await read("ada,,grace")).toEqual(["ada", "grace"]);
    expect(await read("ada, grace")).toEqual(["ada", "grace"]);
  });

  it("drops a repeat rather than handing back a list it would refuse", async () => {
    expect(await read("ada,ada")).toEqual(["ada"]);
  });

  it("gives back something the field would take", async () => {
    const tree = await resolveSchema(
      Schema.make([joined()]),
      { tags: "ada, ,grace," },
      { operation: "edit", record: { tags: "ada, ,grace," } },
    );

    expect(sanitize(tree, { tags: serialise(tree).state["tags"] }).rejected).toEqual(
      [],
    );
  });

  it("tidies a list column too, which is the other shape one is kept in", async () => {
    const listed = await resolveSchema(
      Schema.make([TagsInput.make("tags")]),
      { tags: ["  ada  ", "", "ada"] },
      { operation: "edit", record: { tags: ["  ada  ", "", "ada"] } },
    );

    expect(serialise(listed).state["tags"]).toEqual(["ada"]);
  });
});

describe("a column that keeps them joined", () => {
  const joined = () => TagsInput.make("tags").separator(",");

  it("writes them as one string", async () => {
    const resolved = await tree(joined(), { tags: ["ada", "grace"] });

    expect(dehydrate(resolved, { operation: "create", user: undefined }).set).toEqual({
      tags: "ada,grace",
    });
  });

  it("reads one back as the list it stands for", async () => {
    // Everything above this sees one shape and never asks which storage it
    // came from.
    // The row is handed in as the state, which is what the edit page does:
    // `resolveSchema` normalises what it is given rather than reading the
    // record for a field a client is allowed to send.
    const resolved = await resolveSchema(
      Schema.make([joined()]),
      { tags: "ada,grace" },
      { operation: "edit", record: { tags: "ada,grace" } },
    );

    expect(serialise(resolved).state["tags"]).toEqual(["ada", "grace"]);
  });

  it("reads an empty column as no tags, not as one blank tag", async () => {
    const resolved = await resolveSchema(
      Schema.make([joined()]),
      { tags: "" },
      { operation: "edit", record: { tags: "" } },
    );

    expect(serialise(resolved).state["tags"]).toEqual([]);
  });

  it("refuses a tag carrying the separator", async () => {
    // It would come back as two. A value that changes shape between being
    // written and being read is worse than one the field would not accept.
    expect(await refusal(["ada,grace"], joined())).toBe("wrong-shape");
  });

  it("takes that same tag where no column joins on it", async () => {
    expect(sanitize(await tree(), { tags: ["ada,grace"] }).state).toEqual({
      tags: ["ada,grace"],
    });
  });
});

describe("a column that keeps them as a list", () => {
  it("writes the list, untouched", async () => {
    const resolved = await tree(TagsInput.make("tags"), { tags: ["ada"] });

    expect(dehydrate(resolved, { operation: "create", user: undefined }).set).toEqual({
      tags: ["ada"],
    });
  });
});

describe("what it tells the browser", () => {
  it("its separator and its suggestions", async () => {
    const payload = serialise(
      await tree(TagsInput.make("tags").separator(";").suggestions(["ada", "grace"])),
    );
    const node = payload.schema.children?.[0];

    expect(node?.type).toBe("TagsInput");
    expect(node?.props?.["separator"]).toBe(";");
    expect(node?.props?.["suggestions"]).toEqual(["ada", "grace"]);
  });

  it("nothing about either where neither was declared", async () => {
    const node = serialise(await tree()).schema.children?.[0];

    expect(node?.props?.["separator"]).toBeUndefined();
    expect(node?.props?.["suggestions"]).toBeUndefined();
  });
});

describe("a separator that is not a character", () => {
  it("stops the boot, because every tag contains it", async () => {
    // `"ada".includes("")` is true, so the field would refuse every value a
    // reader can type — silently, and for all of them.
    const complaint = auditSchema(
      Schema.make([TagsInput.make("tags").separator("")]),
    )[0];

    expect(complaint?.problem).toMatch(/refuse every value there is/);
    // And that is what it would have done.
    expect(await refusal(["ada"], TagsInput.make("tags").separator(""))).toBe(
      "wrong-shape",
    );
  });

  it("says nothing about one that is", () => {
    expect(auditSchema(Schema.make([TagsInput.make("tags").separator(",")]))).toEqual(
      [],
    );
  });
});
