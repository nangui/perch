/**
 * A component this package did not write.
 *
 * The extension point the whole tree is shaped for: a type is a string the
 * server puts on a node and the browser looks up, never a class, so somebody
 * else's field travels the same wire and is drawn by the same registry.
 *
 * What was missing was its configuration. The props that cross were read from
 * a table keyed by type, and a type absent from that table crossed with none of
 * its own — so a `StarRating` reached the browser with no idea how many stars.
 */
import { describe, expect, it } from "vitest";
import { auditSchema } from "./audit.js";
import type { FieldState } from "./field.js";
import { baseFieldState, Field } from "./field.js";
import { Schema } from "./layout.js";
import { TextInput } from "./fields/text-input.js";
import type { PrimeState } from "./prime.js";
import { Prime } from "./prime.js";
import { configured } from "./component.js";
import { dehydrate, resolveSchema } from "./resolve.js";
import { sanitize } from "./sanitize.js";
import { serialise } from "./serialise.js";

interface StarsState extends FieldState {
  readonly most?: number;
  readonly half?: boolean;
  /** A resolver, to prove the wire refuses one however it is declared. */
  readonly hint?: () => string;
  /** Anything at all, to prove what the wire cannot carry is refused. */
  readonly held?: unknown;
}

/** Somebody else's field, written entirely against what this package exports. */
class Stars extends Field {
  declare readonly state: StarsState;

  override get type(): string {
    return "StarRating";
  }

  override get sends(): readonly string[] {
    return ["most", "half", "hint", "held"];
  }

  protected override with(patch: Partial<StarsState>): this {
    return super.with(patch);
  }

  static make(name: string): Stars {
    return configured(new Stars(baseFieldState(name)));
  }

  most(value: number): this {
    return this.with({ most: value });
  }

  half(value = true): this {
    return this.with({ half: value });
  }

  hint(value: () => string): this {
    return this.with({ hint: value });
  }

  hold(value: unknown): this {
    return this.with({ held: value });
  }
}

const drawn = async (
  schema: Schema,
  state: Record<string, unknown> = {},
): Promise<ReturnType<typeof serialise>> =>
  serialise(await resolveSchema(schema, state, { operation: "create" }));

describe("a field this package did not write", () => {
  it("carries its own configuration to its own renderer", async () => {
    const payload = await drawn(Schema.make([Stars.make("score").most(5).half()]));
    const node = payload.schema.children?.[0];

    expect(node?.type).toBe("StarRating");
    expect(node?.props?.["most"]).toBe(5);
    expect(node?.props?.["half"]).toBe(true);
  });

  it("sends nothing it has not been given", async () => {
    const payload = await drawn(Schema.make([Stars.make("score")]));

    expect(payload.schema.children?.[0]?.props?.["most"]).toBeUndefined();
  });

  it("cannot put a function on the wire, whatever it declares", async () => {
    // The one rule the serialiser enforces rather than trusts. Shipping a
    // resolver would send the function's source or nothing at all, and the
    // browser is not where a resolver runs.
    const payload = await drawn(
      Schema.make([Stars.make("score").hint(() => "pick one")]),
    );

    expect(payload.schema.children?.[0]?.props?.["hint"]).toBeUndefined();
  });

  it("is a field like any other, so the boundary and the write know it", async () => {
    const tree = await resolveSchema(
      Schema.make([Stars.make("score").most(5)]),
      {},
      { operation: "create" },
    );

    expect(sanitize(tree, { score: 4 }).state).toEqual({ score: 4 });
    expect(
      dehydrate(
        await resolveSchema(
          Schema.make([Stars.make("score")]),
          { score: 4 },
          {
            operation: "create",
          },
        ),
        { operation: "create", user: undefined },
      ).set,
    ).toEqual({ score: 4 });
  });

  it("goes through the same audit the ones here go through", () => {
    expect(auditSchema(Schema.make([Stars.make("score")]))).toEqual([]);
  });
});

describe("what a component says nothing about", () => {
  it("crosses with the props this package listed for it", async () => {
    // The table still answers for everything shipped here, so nothing that
    // worked before this stops working.
    const payload = await drawn(Schema.make([TextInput.make("title").maxLength(80)]));

    expect(payload.schema.children?.[0]?.props?.["maxLength"]).toBe(80);
  });

  it("is not confined to fields: any component may declare what it sends", async () => {
    interface DividerState extends PrimeState {
      readonly thick?: boolean;
    }

    class Divider extends Prime {
      declare readonly state: DividerState;

      override get type(): string {
        return "Divider";
      }
      override get sends(): readonly string[] {
        return ["thick"];
      }
      protected override with(patch: Partial<DividerState>): this {
        return super.with(patch);
      }
      static make(): Divider {
        return configured(new Divider({ children: [] }));
      }
      thick(): this {
        return this.with({ thick: true });
      }
    }

    const payload = await drawn(Schema.make([Divider.make().thick()]));

    expect(payload.schema.children?.[0]?.props?.["thick"]).toBe(true);
  });
});

describe("a prop that will not survive the trip", () => {
  it("stops the boot rather than the page", async () => {
    // The shell puts the payload through `JSON.stringify`. A value that throws
    // there takes the page down with a stack trace about JSON, from a
    // declaration nothing questioned — and the state is fixed when the
    // component is declared, so it is knowable long before a reader asks.
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    const complaint = auditSchema(Schema.make([Stars.make("score").hold(circular)]))[0];

    expect(complaint?.field).toBe("StarRating.held");
    expect(complaint?.problem).toMatch(/cannot be turned into JSON/);

    // And it is the page that would have failed, which is the point.
    const payload = serialise(
      await resolveSchema(
        Schema.make([Stars.make("score").hold(circular)]),
        {},
        { operation: "create" },
      ),
    );
    expect(() => JSON.stringify(payload)).toThrow();
  });

  it("says nothing about a value that will", () => {
    expect(auditSchema(Schema.make([Stars.make("score").most(5)]))).toEqual([]);
  });

  it("says nothing about a resolver, which never leaves the server", () => {
    expect(
      auditSchema(Schema.make([Stars.make("score").hint(() => "pick one")])),
    ).toEqual([]);
  });
});
