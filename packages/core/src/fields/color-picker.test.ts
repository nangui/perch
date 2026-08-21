/**
 * One colour, and the three notations a column keeps it in.
 *
 * The page only ever holds hex — it is what a colour control speaks and what a
 * reader pastes — so what is tested here is mostly the conversion at the other
 * end, and that a column somebody else filled is read as a colour rather than
 * turned away.
 */
import { describe, expect, it } from "vitest";
import { Schema } from "../layout.js";
import { dehydrate, resolveSchema } from "../resolve.js";
import { sanitize } from "../sanitize.js";
import { serialise } from "../serialise.js";
import { ColorPicker } from "./color-picker.js";

const tree = (made = ColorPicker.make("tint"), state: Record<string, unknown> = {}) =>
  resolveSchema(Schema.make([made]), state, { operation: "create" });

const refusal = async (value: unknown) =>
  sanitize(await tree(), { tint: value }).rejected[0]?.reason;

/** What an edit page shows for a column holding this. */
const read = async (stored: unknown, made = ColorPicker.make("tint")) =>
  serialise(
    await resolveSchema(
      Schema.make([made]),
      { tint: stored },
      { operation: "edit", record: { tint: stored } },
    ),
  ).state["tint"];

/** What the column keeps for a colour the reader picked. */
const write = async (made: ColorPicker, hex: string) =>
  dehydrate(await tree(made, { tint: hex }), {
    operation: "create",
    user: undefined,
  }).set["tint"];

/** The widest gap between two colours, in one of 255 steps. */
const apart = (one: string, other: string): number =>
  Math.max(
    ...[1, 3, 5].map((at) =>
      Math.abs(
        Number.parseInt(one.slice(at, at + 2), 16) -
          Number.parseInt(other.slice(at, at + 2), 16),
      ),
    ),
  );

describe("what a colour picker may hold", () => {
  it("hex, which is what the page has to offer", async () => {
    expect(sanitize(await tree(), { tint: "#21594a" }).state).toEqual({
      tint: "#21594a",
    });
  });

  it("nothing at all, which is a column with no colour in it", async () => {
    expect(sanitize(await tree(), { tint: null }).state).toEqual({ tint: null });
  });

  it("nothing that is not text", async () => {
    expect(await refusal(0x21594a)).toBe("wrong-shape");
    expect(await refusal(["#21594a"])).toBe("wrong-shape");
  });

  it("no other notation, because no page here produces one", async () => {
    // The notation is a storage decision. What reaches the boundary comes from
    // a colour control and a box that takes hex, and neither speaks these.
    expect(await refusal("rgb(33, 89, 74)")).toBe("wrong-shape");
    expect(await refusal("hsl(165, 46%, 24%)")).toBe("wrong-shape");
  });

  it("no half-typed colour, and nothing shorter than six digits", async () => {
    expect(await refusal("#21594")).toBe("wrong-shape");
    expect(await refusal("#abc")).toBe("wrong-shape");
    expect(await refusal("21594a")).toBe("wrong-shape");
    expect(await refusal("#21594A")).toBe("wrong-shape");
  });
});

describe("the notation the column keeps", () => {
  it("is hex unless the field says otherwise", async () => {
    expect(await write(ColorPicker.make("tint"), "#21594a")).toBe("#21594a");
    expect(await write(ColorPicker.make("tint").hex(), "#21594a")).toBe("#21594a");
  });

  it("is `rgb()` where that was declared", async () => {
    expect(await write(ColorPicker.make("tint").rgb(), "#21594a")).toBe(
      "rgb(33, 89, 74)",
    );
  });

  it("is `hsl()` where that was declared", async () => {
    expect(await write(ColorPicker.make("tint").hsl(), "#21594a")).toBe(
      "hsl(164, 46%, 24%)",
    );
  });

  it("keeps grey grey, which has no hue to speak of", async () => {
    expect(await write(ColorPicker.make("tint").hsl(), "#808080")).toBe(
      "hsl(0, 0%, 50%)",
    );
    expect(await write(ColorPicker.make("tint").hsl(), "#ffffff")).toBe(
      "hsl(0, 0%, 100%)",
    );
  });

  it("costs a shade nobody can see, and costs it once", async () => {
    // Whole degrees and percentages are what a column of hsl holds, and the
    // rounding has to settle: a row saved, read and saved again untouched must
    // give the column the same string, or every visit moves the colour.
    const hsl = ColorPicker.make("tint").hsl();

    for (const hex of ["#21594a", "#ff0000", "#00ff80", "#123456", "#fedcba"]) {
      const stored = await write(hsl, hex);
      const shown = await read(stored, hsl);

      expect(apart(String(shown), hex)).toBeLessThanOrEqual(3);
      expect(await write(hsl, String(shown))).toBe(stored);
    }
  });
});

describe("a column somebody else filled", () => {
  it("is read as hex, whichever notation it holds", async () => {
    expect(await read("#21594a")).toBe("#21594a");
    expect(await read("rgb(33, 89, 74)")).toBe("#21594a");
    expect(await read("hsl(164, 46%, 24%)")).toBe("#21594a");
  });

  it("is read the same way whichever notation was declared", async () => {
    // The declaration says what to write, not what somebody else wrote.
    expect(await read("rgb(33, 89, 74)", ColorPicker.make("tint").hsl())).toBe(
      "#21594a",
    );
  });

  it("understands the shorthand, and case and spacing nobody meant", async () => {
    expect(await read("#ABC")).toBe("#aabbcc");
    expect(await read("#21594A")).toBe("#21594a");
    expect(await read("rgb( 33,89 , 74 )")).toBe("#21594a");
  });

  it("understands the spelling CSS uses now, which is what wrote most of them", async () => {
    // A column filled by anything recent holds the space-separated form.
    expect(await read("rgb(33 89 74)")).toBe("#21594a");
    expect(await read("hsl(164 46% 24%)")).toBe("#21594a");
    expect(await read("hsl(164deg 46% 24%)")).toBe("#21594a");
  });

  it("understands a channel that was not written as a whole number", async () => {
    expect(await read("rgb(33.4 89.2 73.8)")).toBe("#21594a");
    expect(await read("hsl(163.9, 46.2%, 23.9%)")).toBe("#21594a");
  });

  it("gives back something the field would take", async () => {
    const resolved = await resolveSchema(
      Schema.make([ColorPicker.make("tint")]),
      { tint: "RGB(33, 89, 74)" },
      { operation: "edit", record: { tint: "RGB(33, 89, 74)" } },
    );

    expect(
      sanitize(resolved, { tint: serialise(resolved).state["tint"] }).rejected,
    ).toEqual([]);
  });

  it("leaves alone what is not a colour at all", async () => {
    // The boundary refuses it, which says more than a black swatch would.
    expect(await read("cornflower")).toBe("cornflower");
    expect(await read("rgb(300, 0, 0)")).toBe("rgb(300, 0, 0)");
    expect(await read("rgb(., ., .)")).toBe("rgb(., ., .)");
    expect(await read("hsl(0, 200%, 0%)")).toBe("hsl(0, 200%, 0%)");
    expect(await read("")).toBe("");
  });
});
