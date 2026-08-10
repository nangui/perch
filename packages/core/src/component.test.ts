/**
 * Immutability, which is a vulnerability rather than a style preference. The
 * concurrency case is the one that says so.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Component } from "./component.js";
import { Grid, Schema, Section } from "./layout.js";

afterEach(() => {
  Component.resetConfigurators();
});

describe("fluent calls clone", () => {
  it("leaves the original untouched", () => {
    const base = Section.make("Identity");
    const wide = base.columnSpan("full");

    expect(base.state.columnSpan).toBeUndefined();
    expect(wide.state.columnSpan).toBe("full");
    expect(wide).not.toBe(base);
  });

  it("keeps two derivations of one prototype independent", () => {
    const base = Section.make("Identity");
    const a = base.columns(2).label("A");
    const b = base.columns(3).label("B");

    expect(a.state.columns).toBe(2);
    expect(b.state.columns).toBe(3);
    expect(base.state.columns).toBeUndefined();
    expect(base.state.label).toBe("Identity");
  });

  it("does not share the children array with its source", () => {
    const children = [Section.make("One")];
    const schema = Schema.make(children);
    children.push(Section.make("Two"));

    expect(schema.children).toHaveLength(1);
  });

  it("preserves the concrete class through a clone", () => {
    expect(Section.make("x").collapsible()).toBeInstanceOf(Section);
    expect(Grid.make(2).columnSpan(1)).toBeInstanceOf(Grid);
    expect(Schema.make().label("y")).toBeInstanceOf(Schema);
  });
});

describe("visibility", () => {
  it("stores hidden as the negation of visible, so one flag decides", () => {
    expect(Section.make("s").hidden().state.visible).toBe(false);
    expect(Section.make("s").hidden(false).state.visible).toBe(true);
  });

  it("negates a resolver rather than storing a second flag", async () => {
    const section = Section.make("s").hidden(() => true);
    const resolver = section.state.visible;
    expect(typeof resolver).toBe("function");
    expect(await (resolver as (c: unknown) => Promise<boolean>)(undefined)).toBe(false);
  });
});

describe("layout specifics", () => {
  it("makes a collapsed section collapsible, since the alternative is a trap", () => {
    const section = Section.make("s").collapsed();
    expect(section.state.collapsed).toBe(true);
    expect(section.state.collapsible).toBe(true);
  });

  it("takes columns at construction or after it", () => {
    expect(Grid.make(3).state.columns).toBe(3);
    expect(Grid.make().columns({ default: 1, md: 2 }).state.columns).toEqual({
      default: 1,
      md: 2,
    });
  });
});

describe("configureUsing — extension point E1", () => {
  it("applies to every instance made afterwards", () => {
    Section.configureUsing((s) => s.columns(2));
    expect(Section.make("a").state.columns).toBe(2);
    expect(Section.make("b").state.columns).toBe(2);
  });

  it("applies a base class configurator to its subclasses", () => {
    Component.configureUsing((c) => c.columnSpan("full"));
    expect(Grid.make().state.columnSpan).toBe("full");
    expect(Section.make("s").state.columnSpan).toBe("full");
  });

  it("lets the more specific configurator win over the base one", () => {
    Component.configureUsing((c) => c.columnSpan("full"));
    Section.configureUsing((s) => s.columnSpan(1));
    expect(Section.make("s").state.columnSpan).toBe(1);
    expect(Grid.make().state.columnSpan).toBe("full");
  });

  it("does not reach a component made before it was registered", () => {
    const before = Section.make("before");
    Section.configureUsing((s) => s.columns(4));
    expect(before.state.columns).toBeUndefined();
  });
});

describe("extend", () => {
  it("returns a derived component and leaves the receiver alone", () => {
    const base = Section.make("s");
    const extended = base.extend((s) => s.icon("cog"));
    expect(extended.state.icon).toBe("cog");
    expect(base.state.icon).toBeUndefined();
  });
});

describe("concurrency", () => {
  it("shares no state across 100 parallel derivations of one prototype", async () => {
    // The prototype stands in for a component built at bootstrap, each iteration
    // for a request configuring it differently.
    const prototype = Schema.make([Section.make("Identity")]);

    const results = await Promise.all(
      Array.from({ length: 100 }, async (_, i) => {
        await Promise.resolve();
        const derived = prototype
          .label(`request-${String(i)}`)
          .columnSpan(i % 4 === 0 ? "full" : (i % 4) + 1)
          .key(`k${String(i)}`);
        await Promise.resolve();
        return {
          label: derived.state.label,
          key: derived.state.key,
          children: derived.children.length,
        };
      }),
    );

    for (const [i, r] of results.entries()) {
      expect(r.label).toBe(`request-${String(i)}`);
      expect(r.key).toBe(`k${String(i)}`);
      expect(r.children).toBe(1);
    }
    expect(prototype.state.label).toBeUndefined();
    expect(prototype.state.key).toBeUndefined();
  });
});
