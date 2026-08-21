/**
 * What a layout says applies to what it holds.
 *
 * Two of the invariants this engine is built on are about a field nobody can
 * see: client state is replayed against the tree and an invisible path is
 * discarded silently, and an invisible field is never validated nor persisted.
 * Both were read one node at a time, so both stopped at the node that declared
 * them.
 *
 * The result was the worst shape a trust boundary can take. The payload drops
 * an invisible subtree, so an honest browser never learned the field existed —
 * and a forged state naming its path was admitted, validated and written.
 */
import { describe, expect, it } from "vitest";
import { Fieldset, Schema, Section } from "./layout.js";
import { TextInput } from "./fields/text-input.js";
import { dehydrate, resolveSchema } from "./resolve.js";
import { sanitize } from "./sanitize.js";
import { serialise } from "./serialise.js";

const resolve = async (root: Schema, state: Record<string, unknown> = {}) =>
  resolveSchema(root, state, { operation: "create" });

const secret = (state: Record<string, unknown> = {}) =>
  resolve(
    Schema.make([
      TextInput.make("name"),
      Section.make("Secret")
        .hidden()
        .schema([TextInput.make("role")]),
    ]),
    state,
  );

describe("a field inside a hidden layout", () => {
  it("never reaches an honest browser", async () => {
    // This half always held: the payload is built by walking the tree, so an
    // invisible parent takes its children with it.
    expect(JSON.stringify(serialise(await secret()))).not.toContain("role");
  });

  it("is refused when a forged state names its path", async () => {
    expect(sanitize(await secret(), { role: "owner" }).state).toEqual({});
  });

  it("is not written, however the value got into the state", async () => {
    expect(
      dehydrate(await secret({ role: "owner" }), {
        operation: "create",
        user: undefined,
      }).set,
    ).toEqual({});
  });

  it("leaves what is beside it alone", async () => {
    // The rule is about what a layout holds, not about the page.
    expect(sanitize(await secret(), { name: "Ada" }).state).toEqual({ name: "Ada" });
  });
});

describe("a field inside a disabled layout", () => {
  const locked = () =>
    resolve(
      Schema.make([
        Fieldset.make("Admin")
          .disabled()
          .schema([TextInput.make("role")]),
      ]),
    );

  it("is disabled itself, which is what the reader is shown", async () => {
    const node = (await locked()).nodes.find((one) => one.path === "role");

    expect(node?.disabled).toBe(true);
  });

  it("refuses what a reader types into it", async () => {
    // A group that says nobody may write to it and then accepts a write is
    // worse than one that never said anything.
    expect(sanitize(await locked(), { role: "owner" }).state).toEqual({});
  });
});

describe("which way each flag falls", () => {
  it("hidden wins over shown: a child cannot show itself inside a hidden parent", async () => {
    const tree = await resolve(
      Schema.make([
        Section.make("Secret")
          .hidden()
          .schema([TextInput.make("role").visible()]),
      ]),
    );

    expect(tree.nodes.find((one) => one.path === "role")?.visible).toBe(false);
  });

  it("hidden wins over shown the other way too: a parent cannot reveal what a child hid", async () => {
    const tree = await resolve(
      Schema.make([Section.make("Open").schema([TextInput.make("role").hidden()])]),
    );

    expect(tree.nodes.find((one) => one.path === "role")?.visible).toBe(false);
  });

  it("carries through however many layouts stand between", async () => {
    const tree = await resolve(
      Schema.make([
        Section.make("Outer")
          .hidden()
          .schema([Fieldset.make("Inner").schema([TextInput.make("role")])]),
      ]),
    );

    expect(tree.nodes.find((one) => one.path === "role")?.visible).toBe(false);
  });

  it("leaves a layout's own answer where a later pass can read it", async () => {
    // The two are kept apart on purpose. A pass that carried the effective
    // flags would keep a child hidden after the section above it came back:
    // the child's own reads never changed, so nothing would recompute it.
    const tree = await resolve(
      Schema.make([
        Section.make("Secret")
          .hidden()
          .schema([TextInput.make("role")]),
      ]),
    );
    const node = tree.nodes.find((one) => one.path === "role");

    expect(node?.own.visible).toBe(true);
    expect(node?.visible).toBe(false);
  });
});

describe("a layout that changes its mind between round trips", () => {
  // The child carries a resolver of its own, which is what puts it in the trace
  // and lets a later pass reuse it rather than resolve it again. A child with
  // no resolver is rebuilt every time and would prove nothing here.
  const form = () =>
    Schema.make([
      TextInput.make("country").live(),
      TextInput.make("other"),
      Section.make("Region")
        .visible(({ get }) => get("country") === "fr")
        .schema([
          TextInput.make("region").helperText(
            ({ get }) => `beside ${String(get("other"))}`,
          ),
        ]),
    ]);

  it("brings its children back with it", async () => {
    // The case the two flags are kept apart for. This pass reuses a node whose
    // own reads did not change — the child reads `other`, and `country` is what
    // moved — so a child carrying an inherited `false` would stay hidden after
    // the section came back, leaving the reader a section with nothing in it.
    const first = await resolveSchema(form(), {}, { operation: "create" });
    const child = first.nodes.find((one) => one.path === "region");
    expect(child?.visible).toBe(false);
    // Reused only if there is something to reuse, so the test says so out loud.
    expect(first.trace.has(child?.id ?? "")).toBe(true);

    const second = await resolveSchema(
      form(),
      { country: "fr" },
      { operation: "create", dirtyPath: "country", previous: first },
    );

    expect(second.nodes.find((one) => one.path === "region")?.visible).toBe(true);
  });

  it("takes them away again when it goes", async () => {
    const shown = await resolveSchema(
      form(),
      { country: "fr" },
      {
        operation: "create",
      },
    );
    const gone = await resolveSchema(
      form(),
      { country: "be" },
      { operation: "create", dirtyPath: "country", previous: shown },
    );

    expect(gone.nodes.find((one) => one.path === "region")?.visible).toBe(false);
    expect(sanitize(gone, { region: "Wallonia" }).state).toEqual({});
  });
});
