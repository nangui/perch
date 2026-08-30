/**
 * @vitest-environment jsdom
 *
 * The browser half of making an option a select is missing.
 *
 * Three things here, and each of them cost a browser to find. A dialog holding
 * a form is a `<form>`, and a create page is a `<form>` — nested, the submit
 * button does nothing at all, and a portal alone does not fix it because a
 * portal's events still travel up the React tree. And a select control clears
 * itself when a value arrives ahead of the list it belongs to, which is exactly
 * what a create does.
 *
 * None of it shows in a type, and none of it shows in a server test.
 */
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { PanelForm } from "./PanelForm.js";
import { CreateOption } from "./fields/CreateOption.js";
import { reportable, Select } from "./fields/Select.js";
import { registerBuiltInComponents } from "./renderers.js";
import { resetRegistry } from "./registry.js";

// jsdom knows the element but not the two methods that make it modal.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

const binding = {
  id: "one",
  "aria-describedby": "one-hint",
  "aria-invalid": false,
  "aria-required": false,
  disabled: false,
  readOnly: false,
};

const dialogForm: SchemaPayload = {
  schema: {
    id: "0",
    type: "Schema",
    children: [{ id: "name", type: "TextInput", path: "name", label: "Name" }],
  },
  state: { name: "" },
  errors: {},
};

describe("a select control asked to hold a value its list has not caught up with", () => {
  it("treats an empty value as the control clearing itself, not as a choice", () => {
    // The control forbids an item whose value is the empty string, so nobody
    // can pick one. Everything else is the reader.
    expect(reportable("")).toBe(false);
    expect(reportable("1")).toBe(true);
    expect(reportable("0")).toBe(true);
  });

  it("does not report a choice nobody made", () => {
    // The control's own list is a window onto a table. A row created a second
    // ago is outside it, and every select in existence answers a value it
    // cannot draw by clearing itself — which would undo what the server had
    // just settled, and send an empty patch on top.
    cleanup();
    const said = vi.fn();
    render(
      <Select
        value="99"
        onValueChange={said}
        options={[{ value: "1", label: "Engineering" }]}
        status={{ lifecycle: "rest" }}
        binding={binding}
      />,
    );

    expect(said).not.toHaveBeenCalledWith("");
  });

  it("still reports a choice that is one", () => {
    // The guard must not swallow the reader. An empty string is never an option
    // here — the underlying control forbids one — so everything else passes.
    cleanup();
    const said = vi.fn();
    const { container } = render(
      <Select
        value="1"
        onValueChange={said}
        options={[
          { value: "1", label: "Engineering" },
          { value: "2", label: "Design" },
        ]}
        status={{ lifecycle: "rest" }}
        binding={binding}
      />,
    );
    // The native mirror the control keeps for form compatibility.
    const native = container.querySelector("select");
    if (native !== null) fireEvent.change(native, { target: { value: "2" } });

    expect(said).not.toHaveBeenCalledWith("");
  });
});

describe("the dialog that creates one", () => {
  /** A create page: a form, with the field and its dialog inside it. */
  function Page({
    onHostSubmit,
    submit,
  }: {
    readonly onHostSubmit: () => void;
    readonly submit: () => Promise<never>;
  }): React.ReactNode {
    const [open, setOpen] = useState(true);
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onHostSubmit();
        }}
      >
        <CreateOption
          label="Team"
          open={open}
          onClose={() => {
            setOpen(false);
          }}
          askForm={() => Promise.resolve(dialogForm)}
          resolve={() => Promise.resolve({ payload: dialogForm })}
          submit={submit}
        />
      </form>
    );
  }

  it("submits itself and not the page it was opened from", async () => {
    // Nested, the page saves itself — empty — behind the dialog. That is a
    // write nobody asked for, and it happened on a real page before this test
    // existed.
    cleanup();
    resetRegistry();
    registerBuiltInComponents();
    const host = vi.fn();
    const submit = vi.fn(() =>
      Promise.resolve({
        option: { value: 4, label: "Ferriers" },
        payload: dialogForm,
      }),
    ) as unknown as () => Promise<never>;

    render(<Page onHostSubmit={host} submit={submit} />);
    const form = await waitFor(() => {
      const found = document.querySelector("dialog form");
      expect(found).not.toBeNull();
      return found as HTMLFormElement;
    });

    fireEvent.submit(form);

    await waitFor(() => {
      expect(submit).toHaveBeenCalled();
    });
    expect(host).not.toHaveBeenCalled();
  });

  it("is drawn outside the form it was opened from", async () => {
    // A form inside a form is dropped by the platform, and the button then
    // reaches no handler at all. The portal is what keeps them apart.
    cleanup();
    resetRegistry();
    registerBuiltInComponents();
    render(
      <Page
        onHostSubmit={vi.fn()}
        submit={(() => Promise.resolve({})) as unknown as () => Promise<never>}
      />,
    );

    const dialog = await waitFor(() => {
      const found = document.querySelector("dialog");
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(dialog.closest("form")).toBeNull();
  });
});

/**
 * The whole browser chain, from the button to what the field ends up holding.
 *
 * The route answers with the host form resolved and the choice already in it,
 * and something has to apply that. Nothing else here would notice if nobody
 * did: the row would be written, the dialog would shut, and the field would sit
 * there as empty as before — which reads exactly like a create that failed.
 */
describe("what the field holds afterwards", () => {
  const hostBefore: SchemaPayload = {
    schema: {
      id: "0",
      type: "Schema",
      children: [
        {
          id: "teamId",
          type: "Select",
          path: "teamId",
          label: "Team",
          options: [],
          props: { createsOption: true },
        },
      ],
    },
    state: { teamId: "" },
    errors: {},
  };

  const hostAfter: SchemaPayload = {
    ...hostBefore,
    schema: {
      ...hostBefore.schema,
      children: [
        {
          ...(hostBefore.schema.children ?? [])[0],
          options: [{ value: 4, label: "Ferriers" }],
        } as never,
      ],
    },
    state: { teamId: 4 },
  };

  it("is what the server sent back, applied by the form and not by the control", async () => {
    cleanup();
    resetRegistry();
    registerBuiltInComponents();

    const { container } = render(
      <PanelForm
        initial={hostBefore}
        send={() => Promise.resolve({ payload: hostBefore })}
        optionForm={() => Promise.resolve(dialogForm)}
        createOption={() =>
          Promise.resolve({
            option: { value: 4, label: "Ferriers" },
            payload: hostAfter,
          })
        }
      />,
    );

    fireEvent.click(container.querySelector(".perch-select-create") as HTMLElement);
    const form = await waitFor(() => {
      const found = document.querySelector("dialog form");
      expect(found).not.toBeNull();
      return found as HTMLFormElement;
    });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(container.textContent).toContain("Ferriers");
    });
  });
});

describe("how often the dialog asks for its schema", () => {
  it("is once, however often the form behind it redraws", async () => {
    // Every capability on the way down is an arrow rebuilt on each render, so
    // an effect that depends on one runs again on every render of the page
    // behind the dialog — a live field elsewhere, a patch coming back — and
    // asks the server for the same schema each time.
    cleanup();
    resetRegistry();
    registerBuiltInComponents();

    let asked = 0;
    function Host(): React.ReactNode {
      const [, redraw] = useState(0);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              redraw((n) => n + 1);
            }}
          >
            redraw
          </button>
          <CreateOption
            label="Team"
            open
            onClose={vi.fn()}
            askForm={() => {
              asked += 1;
              return Promise.resolve(dialogForm);
            }}
            resolve={() => Promise.resolve({ payload: dialogForm })}
            submit={(() => Promise.resolve({})) as unknown as () => Promise<never>}
          />
        </>
      );
    }

    const { getByText } = render(<Host />);
    await waitFor(() => {
      expect(asked).toBe(1);
    });

    fireEvent.click(getByText("redraw"));
    fireEvent.click(getByText("redraw"));
    await waitFor(() => {
      expect(document.querySelector("dialog form")).not.toBeNull();
    });

    expect(asked).toBe(1);
  });
});
