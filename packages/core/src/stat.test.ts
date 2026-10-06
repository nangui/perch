import { describe, expect, it } from "vitest";
import { auditStats } from "./stat-audit.js";
import { serialiseStats, Stat } from "./stat.js";

describe("one number on a card", () => {
  it("carries the label and the value, which are the two it cannot do without", () => {
    expect(serialiseStats([Stat.make("Sales", 42)])).toEqual([
      { label: "Sales", value: 42 },
    ]);
  });

  it("copies no key that was not set", () => {
    // The same rule the table's serialiser keeps: a client meeting a key it
    // did not expect cannot tell an absent decision from a default one.
    const [node] = serialiseStats([Stat.make("Sales", 42)]);

    expect(Object.keys(node ?? {})).toEqual(["label", "value"]);
  });

  it("clones on every method, so one shared between requests leaks nothing", () => {
    const bare = Stat.make("Sales", 42);
    const toned = bare.color("success");

    expect(bare).not.toBe(toned);
    expect(bare.state.tone).toBeUndefined();
    expect(toned.state.tone).toBe("success");
  });

  it("says what a reader needs beside the number", () => {
    expect(
      serialiseStats([
        Stat.make("Sales", 1200)
          .money("EUR")
          .color("success")
          .icon("plus")
          .description("12% over last week")
          .descriptionIcon("chevron-down"),
      ]),
    ).toEqual([
      {
        label: "Sales",
        value: 1200,
        format: "money",
        currency: "EUR",
        tone: "success",
        icon: "plus",
        description: "12% over last week",
        descriptionIcon: "chevron-down",
      },
    ]);
  });

  it("carries nothing as nothing, which is not a zero", () => {
    // What an aggregate answers over no rows. A card showing 0 states a total
    // nobody worked out, and this is the one place a reader sees it.
    expect(serialiseStats([Stat.make("Sales", null)])[0]?.value).toBeNull();
  });

  it("keeps a decimal's exactness by carrying the string it came as", () => {
    expect(serialiseStats([Stat.make("Owed", "1234.56").money("EUR")])[0]?.value).toBe(
      "1234.56",
    );
  });

  it("takes a number of places only when one was asked for", () => {
    expect(serialiseStats([Stat.make("Rate", 0.5).numeric()])[0]).toEqual({
      label: "Rate",
      value: 0.5,
      format: "numeric",
    });
    expect(serialiseStats([Stat.make("Rate", 0.5).numeric(2)])[0]?.decimals).toBe(2);
  });
});

describe("what a card cannot be drawn with", () => {
  it("says nothing about cards that can be", () => {
    expect(
      auditStats([Stat.make("Sales", 42).icon("plus"), Stat.make("Owed", null)]),
    ).toEqual([]);
  });

  it("refuses an icon the panel has no drawing for, naming the card", () => {
    const [said] = auditStats([Stat.make("Sales", 42).icon("sparkles" as never)]);

    expect(said?.field).toBe("Sales");
    expect(said?.problem).toContain("has no drawing for");
  });

  it("refuses one on the description too", () => {
    expect(
      auditStats([Stat.make("Sales", 42).descriptionIcon("nope" as never)]),
    ).toHaveLength(1);
  });

  it("refuses a value that cannot be sent, which a host works out itself", () => {
    // Nothing upstream widened this one: a row's bigint columns are converted
    // by the adapter, and a stat's value never went through it.
    const [said] = auditStats([Stat.make("Sales", 1n as never)]);

    expect(said?.problem).toContain("has a bigint for a value");
    expect(said?.problem).toContain("takes the request down");
  });

  it("refuses an object, for the same reason and in the same words", () => {
    expect(auditStats([Stat.make("Sales", {} as never)])).toHaveLength(1);
  });

  it("names a card with no label by where it sits", () => {
    // A complaint has to be findable, and a card that gave itself no name left
    // only its position.
    expect(auditStats([Stat.make("", 1n as never)])[0]?.field).toBe("the stat at 0");
  });

  it("complains once per fault, across every card", () => {
    expect(
      auditStats([
        Stat.make("Sales", 42).icon("nope" as never),
        Stat.make("Owed", 1n as never),
        Stat.make("Fine", 7),
      ]),
    ).toHaveLength(2);
  });
});
