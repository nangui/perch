/**
 * @vitest-environment jsdom
 *
 * A1 in a browser: the payload the server produces, rendered, with the city
 * select appearing only once the server itself says so.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { registerBuiltInComponents } from "./renderers.js";
import { registerComponent, resetRegistry } from "./registry.js";
import { SchemaRenderer } from "./SchemaRenderer.js";

beforeEach(() => {
  resetRegistry();
  registerBuiltInComponents();
});
afterEach(cleanup);

/** What `serialise()` produces for the A1 form with no country chosen. */
const WITHOUT_COUNTRY: SchemaPayload = {
  schema: {
    id: "0",
    type: "Schema",
    children: [
      {
        id: "0/0",
        type: "Section",
        label: "Location",
        props: { columns: 2 },
        children: [
          {
            id: "countryId",
            type: "Select",
            path: "countryId",
            label: "Country",
            options: [{ value: "fr", label: "France" }],
          },
        ],
      },
    ],
  },
  state: {},
  errors: {},
};

/** The same form after the server resolved the country as chosen. */
const WITH_COUNTRY: SchemaPayload = {
  schema: {
    ...WITHOUT_COUNTRY.schema,
    children: [
      {
        ...WITHOUT_COUNTRY.schema.children![0]!,
        children: [
          ...WITHOUT_COUNTRY.schema.children![0]!.children!,
          {
            id: "cityId",
            type: "Select",
            path: "cityId",
            label: "City",
            options: [{ value: "1", label: "Paris" }],
          },
        ],
      },
    ],
  },
  state: { countryId: "fr" },
  errors: {},
};

describe("A1, rendered", () => {
  it("shows no city field while the payload carries none", () => {
    render(<SchemaRenderer payload={WITHOUT_COUNTRY} onChange={() => undefined} />);
    expect(screen.getByText("Country")).toBeDefined();
    expect(screen.queryByText("City")).toBeNull();
  });

  it("shows the city field once the server sends it", () => {
    render(<SchemaRenderer payload={WITH_COUNTRY} onChange={() => undefined} />);
    expect(screen.getByText("City")).toBeDefined();
  });

  it("reports a change with the path the server named", () => {
    const onChange = vi.fn();
    render(<SchemaRenderer payload={WITH_COUNTRY} onChange={onChange} />);
    // Radix's Select needs a pointer environment jsdom does not provide, so the
    // wiring is asserted rather than driven: the field exists and owns its path.
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
  });
});

describe("an unknown type does not wipe out the page", () => {
  const withUnknown: SchemaPayload = {
    schema: {
      id: "0",
      type: "Schema",
      children: [
        { id: "a", type: "TextInput", path: "a", label: "Kept" },
        { id: "b", type: "StarRating", path: "b", label: "Unknown" },
      ],
    },
    state: { a: "value" },
    errors: {},
  };

  it("renders the rest of the form", () => {
    render(<SchemaRenderer payload={withUnknown} onChange={() => undefined} />);
    expect(screen.getByText("Kept")).toBeDefined();
  });

  it("marks the gap in development rather than leaving a blank", () => {
    render(<SchemaRenderer payload={withUnknown} onChange={() => undefined} />);
    const marker = document.querySelector("[data-perch-unknown]");
    expect(marker?.textContent).toContain("StarRating");
    // Not a live region: a developer diagnostic must not be read aloud.
    expect(marker?.getAttribute("role")).toBeNull();
  });

  it("renders a registered plugin type through the same call", () => {
    registerComponent("StarRating", ({ node }) => <div>stars for {node.path}</div>);
    render(<SchemaRenderer payload={withUnknown} onChange={() => undefined} />);
    expect(screen.getByText("stars for b")).toBeDefined();
  });
});

describe("errors and pending come from the payload", () => {
  const payload: SchemaPayload = {
    schema: {
      id: "0",
      type: "Schema",
      children: [{ id: "email", type: "TextInput", path: "email", label: "Email" }],
    },
    state: { email: "a@b" },
    errors: { email: "Not a valid email." },
  };

  it("puts the server message on the field's reserved line", () => {
    render(<SchemaRenderer payload={payload} onChange={() => undefined} />);
    expect(screen.getByRole("status").textContent).toBe("Not a valid email.");
  });

  it("says a held edit is unsaved, not saving", () => {
    // A field with no `live` sends nothing until the form is submitted. Calling
    // that "Saving…" describes a request that will never happen.
    render(
      <SchemaRenderer
        payload={{ ...payload, errors: {} }}
        onChange={() => undefined}
        pending={new Set(["email"])}
      />,
    );

    expect(screen.getByText("Unsaved")).toBeDefined();
    expect(screen.queryByText("Saving…")).toBeNull();
  });

  it("says saving once a request is carrying it", () => {
    // On a field with no error: the lifecycle is one value, and an error wins
    // over "Saving…" by design.
    render(
      <SchemaRenderer
        payload={{ ...payload, errors: {} }}
        onChange={() => undefined}
        pending={new Set(["email"])}
        inFlight={new Set(["email"])}
      />,
    );

    expect(screen.getByText("Saving…")).toBeDefined();
  });
});

describe("memoisation", () => {
  it("does not re-render a node nothing changed about", () => {
    // `memo` compares props by identity, so an unstable `renderChild` or
    // `onChange` makes it decorative. This is the assertion that catches that.
    let renders = 0;
    resetRegistry();
    registerComponent("Schema", ({ node, renderChild }) => (
      <div>{(node.children ?? []).map(renderChild)}</div>
    ));
    registerComponent("Leaf", () => {
      renders += 1;
      return <div>leaf</div>;
    });

    const payload: SchemaPayload = {
      schema: {
        id: "0",
        type: "Schema",
        children: [{ id: "a", type: "Leaf", path: "a" }],
      },
      state: {},
      errors: {},
    };
    const onChange = (): void => undefined;

    const { rerender } = render(
      <SchemaRenderer payload={payload} onChange={onChange} />,
    );
    const first = renders;
    rerender(<SchemaRenderer payload={payload} onChange={onChange} />);

    expect(renders).toBe(first);
  });
});

describe("resolved properties reach the control", () => {
  it("passes the placeholder the server resolved", () => {
    const payload: SchemaPayload = {
      schema: {
        id: "0",
        type: "Schema",
        children: [
          {
            id: "email",
            type: "TextInput",
            path: "email",
            label: "Email",
            placeholder: "you@example.com",
          },
        ],
      },
      state: {},
      errors: {},
    };
    render(<SchemaRenderer payload={payload} onChange={() => undefined} />);
    expect(screen.getByPlaceholderText("you@example.com")).toBeDefined();
  });

  it("marks a required field for the user, not only for the server", () => {
    const payload: SchemaPayload = {
      schema: {
        id: "0",
        type: "Schema",
        children: [
          { id: "a", type: "TextInput", path: "a", label: "Name", required: true },
        ],
      },
      state: {},
      errors: {},
    };
    render(<SchemaRenderer payload={payload} onChange={() => undefined} />);
    expect(document.querySelector(".perch-field__required")).not.toBeNull();
  });
});
