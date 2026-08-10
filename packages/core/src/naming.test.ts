/**
 * Three callers now derive a URL from a model name — the decorator's default,
 * the navigation's plural label, and doctor's collision check. They agree only
 * because they call this, so what it answers is worth writing down.
 */
import { describe, expect, it } from "vitest";
import { defaultSlug, kebab, plural } from "./naming.js";

describe("plural", () => {
  it("turns a consonant + y into ies", () => {
    expect(plural("Country")).toBe("Countries");
    expect(plural("Category")).toBe("Categories");
  });

  it("leaves a vowel + y alone", () => {
    // `Daies` is the mistake the naive rule makes without this case.
    expect(plural("Day")).toBe("Days");
  });

  it("adds es to a sibilant", () => {
    expect(plural("Address")).toBe("Addresses");
    expect(plural("Box")).toBe("Boxes");
    expect(plural("Batch")).toBe("Batches");
    expect(plural("Dish")).toBe("Dishes");
  });

  it("adds s to everything else", () => {
    expect(plural("User")).toBe("Users");
    expect(plural("OrderLine")).toBe("OrderLines");
  });
});

describe("kebab", () => {
  it("splits a camel-cased name", () => {
    expect(kebab("OrderLine")).toBe("order-line");
    expect(kebab("User")).toBe("user");
  });

  it("keeps a digit with the word before it", () => {
    expect(kebab("Address2")).toBe("address2");
    expect(kebab("V2Endpoint")).toBe("v2-endpoint");
  });
});

describe("the slug a resource lands on when it does not say", () => {
  it("is the kebab-cased plural", () => {
    expect(defaultSlug("User")).toBe("users");
    expect(defaultSlug("OrderLine")).toBe("order-lines");
    expect(defaultSlug("Country")).toBe("countries");
  });

  it("is stable enough to compare two of them", () => {
    // What doctor's collision check rests on: same model, same answer, and two
    // models that differ only in case are the same URL.
    expect(defaultSlug("Post")).toBe(defaultSlug("post"));
  });
});
