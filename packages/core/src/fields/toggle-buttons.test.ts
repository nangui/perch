/**
 * A radio group wearing buttons.
 *
 * The claim is the same one: every choice is on the page, so the set is closed
 * and the boundary can say so. What is tested here is that the closing holds
 * and that the two words about how it is drawn reach the browser.
 */
import { describe, expect, it } from "vitest";
import { auditSchema } from "../audit.js";
import { Schema } from "../layout.js";
import { resolveSchema } from "../resolve.js";
import { sanitize } from "../sanitize.js";
import { serialise } from "../serialise.js";
import { ToggleButtons } from "./toggle-buttons.js";

const ROLES = [
  { value: "lead", label: "Lead" },
  { value: "member", label: "Member" },
];

const tree = (
  made = ToggleButtons.make("role").options(ROLES),
  state: Record<string, unknown> = {},
) => resolveSchema(Schema.make([made]), state, { operation: "create" });

const refusal = async (value: unknown) =>
  sanitize(await tree(), { role: value }).rejected[0]?.reason;

describe("what a set of toggle buttons may hold", () => {
  it("one of the choices it declared", async () => {
    expect(sanitize(await tree(), { role: "lead" }).state).toEqual({ role: "lead" });
  });

  it("nothing at all, which is a reader who has not chosen", async () => {
    expect(sanitize(await tree(), { role: null }).state).toEqual({ role: null });
  });

  it("nothing from outside the list, because every choice is on the page", async () => {
    // No window and no relation to excuse a value from elsewhere: the set is
    // closed here or it is not closed anywhere.
    expect(await refusal("owner")).toBe("undeclared-value");
  });

  it("nothing that is not a single value", async () => {
    expect(await refusal(["lead"])).toBe("wrong-shape");
    expect(await refusal({ value: "lead" })).toBe("wrong-shape");
  });

  it("a choice declared as a number, which a form returns as text", async () => {
    const numbered = ToggleButtons.make("role").options([{ value: 2, label: "Two" }]);

    expect(sanitize(await tree(numbered), { role: "2" }).state).toEqual({ role: "2" });
  });
});

describe("what it tells the browser", () => {
  it("how the choices are laid out", async () => {
    const node = serialise(
      await tree(ToggleButtons.make("role").options(ROLES).inline().grouped()),
    ).schema.children?.[0];

    expect(node?.type).toBe("ToggleButtons");
    expect(node?.props?.["inline"]).toBe(true);
    expect(node?.props?.["grouped"]).toBe(true);
  });

  it("that they are joined, without being told twice", async () => {
    // Sharing an edge means standing in a row, and where that is settled is
    // where it is drawn: a builder that writes one method from another answers
    // differently depending on which was written first.
    const node = serialise(
      await tree(ToggleButtons.make("role").options(ROLES).grouped()),
    ).schema.children?.[0];

    expect(node?.props?.["grouped"]).toBe(true);
    expect(node?.props?.["inline"]).toBe(false);
  });

  it("the choices themselves", async () => {
    const node = serialise(await tree()).schema.children?.[0];

    expect(node?.options).toEqual(ROLES);
  });
});

describe("a set of choices with no choices in it", () => {
  it("stops the boot, because it offers nothing and would refuse anything", () => {
    const complaints = auditSchema(Schema.make([ToggleButtons.make("role")]));

    expect(complaints).toHaveLength(1);
    expect(complaints[0]?.field).toBe("role");
    expect(complaints[0]?.problem).toContain("no options");
  });
});
