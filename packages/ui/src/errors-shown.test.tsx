/**
 * @vitest-environment jsdom
 *
 * A form nobody has filled in is not wrong yet. The server reports an empty
 * required field from the first render; showing that before the user has said
 * anything scolds them for what they have not done.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { PanelForm } from "./PanelForm.js";
import { registerBuiltInComponents } from "./renderers.js";
import { resetRegistry } from "./registry.js";
import type { SaveResponse, StateResponse } from "./transport.js";

beforeEach(() => {
  resetRegistry();
  registerBuiltInComponents();
});
afterEach(cleanup);

/** What the create page ships: required fields, empty, already reported. */
function payload(): SchemaPayload {
  return {
    schema: {
      id: "0",
      type: "Schema",
      children: [
        {
          id: "first",
          type: "TextInput",
          path: "first",
          label: "First name",
          required: true,
        },
        {
          id: "last",
          type: "TextInput",
          path: "last",
          label: "Last name",
          required: true,
        },
      ],
    },
    state: { first: "", last: "" },
    errors: { first: "This field is required.", last: "This field is required." },
  };
}

const never = (): Promise<StateResponse> => new Promise(() => undefined);
const refused = (): Promise<SaveResponse> =>
  Promise.resolve({ errors: payload().errors, payload: payload() });

describe("on a form nobody has touched", () => {
  it("shows none of them", () => {
    render(<PanelForm initial={payload()} send={never} />);

    expect(screen.queryAllByText("This field is required.")).toHaveLength(0);
  });
});

describe("once the value changes", () => {
  it("stops showing an error about the value it replaced", () => {
    // What the browser showed: "This field is required" under a filled field.
    // The error was true when the page was built and the server has had no
    // chance to say otherwise, because this field triggers no round trip.
    const withOneShown: SchemaPayload = {
      ...payload(),
      errors: { first: "Too short." },
    };
    render(<PanelForm initial={withOneShown} send={never} />);

    fireEvent.change(screen.getByLabelText(/First name/), {
      target: { value: "Adonai" },
    });

    expect(screen.queryByText("Too short.")).toBeNull();
  });
});

describe("once a submission is refused", () => {
  it("shows all of them, touched or not", async () => {
    render(<PanelForm initial={payload()} send={never} save={refused} />);

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.queryAllByText("This field is required.")).toHaveLength(2);
    });
  });
});
