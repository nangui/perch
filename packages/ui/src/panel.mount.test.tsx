/**
 * @vitest-environment jsdom
 *
 * What the served bundle actually puts on the wire.
 *
 * Every other test here writes both ends of the conversation, so both ends
 * agreed by construction. This one drives the real mount and reads the request
 * off a stubbed `fetch` — the browser found what that could not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import type { SchemaPayload } from "@perchjs/core";
import { mount } from "./panel.js";
import { lookupColumn, resetColumnRegistry } from "./column-registry.js";
import { resetRegistry } from "./registry.js";

const payload: SchemaPayload = {
  schema: {
    id: "0",
    type: "Schema",
    children: [
      {
        id: "title",
        type: "TextInput",
        path: "title",
        label: "Title",
        live: { debounce: 0, onBlur: false },
      },
    ],
  },
  state: { title: "" },
  errors: {},
};

type FetchArgs = [string, { method?: string; body?: string }];
let fetchMock: ReturnType<typeof vi.fn>;

const callArgs = (index: number): FetchArgs =>
  fetchMock.mock.calls[index] as unknown as FetchArgs;

beforeEach(() => {
  resetRegistry();
  fetchMock = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      // Exactly what the route answers: the tree itself, no envelope. Wrapping
      // it here would be writing both ends again, which is what let the last
      // two defects through.
      json: () => Promise.resolve(payload),
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  // The mount points are appended by hand, so they outlive cleanup().
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function element(dataset: Record<string, string>): HTMLElement {
  const node = document.createElement("div");
  node.id = "perch-panel";
  for (const [key, value] of Object.entries(dataset)) node.dataset[key] = value;
  document.body.append(node);
  return node;
}

const bodyOf = (call: number): Record<string, unknown> =>
  JSON.parse(String(callArgs(call)[1].body)) as Record<string, unknown>;

describe("a round trip from the create page", () => {
  it("says which operation it is for", async () => {
    // Without this the server has no operation to resolve against and refuses
    // the request, which is what the browser showed and no test did.
    act(() => {
      mount(
        element({
          api: "/admin/api/people",
          operation: "create",
          payload: JSON.stringify(payload),
        }),
      );
    });

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Hello" } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(callArgs(0)[0]).toBe("/admin/api/people/state");
    expect(bodyOf(0)["operation"]).toBe("create");
    expect(bodyOf(0)["dirtyPath"]).toBe("title");
  });
});

describe("a round trip from the edit page", () => {
  it("names the row as well", async () => {
    act(() => {
      mount(
        element({
          api: "/admin/api/people",
          operation: "edit",
          id: "7",
          payload: JSON.stringify(payload),
        }),
      );
    });

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Hello" } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(bodyOf(0)["operation"]).toBe("edit");
    expect(bodyOf(0)["id"]).toBe("7");
  });
});

describe("submitting", () => {
  it("posts to the collection on a create", async () => {
    act(() => {
      mount(
        element({
          api: "/admin/api/people",
          operation: "create",
          payload: JSON.stringify(payload),
        }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(callArgs(0)[0]).toBe("/admin/api/people");
    expect(callArgs(0)[1].method).toBe("POST");
  });

  it("patches the row on an edit", async () => {
    act(() => {
      mount(
        element({
          api: "/admin/api/people",
          operation: "edit",
          id: "7",
          payload: JSON.stringify(payload),
        }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(callArgs(0)[0]).toBe("/admin/api/people/7");
    expect(callArgs(0)[1].method).toBe("PATCH");
  });
});

describe("absorbing the answer", () => {
  it("survives a second round trip, which means it kept a tree", async () => {
    // The route answers with the tree itself. Treating that as an envelope
    // stored `undefined` and the next render threw — which is what the browser
    // reported and nothing here saw.
    act(() => {
      mount(
        element({
          api: "/admin/api/people",
          operation: "create",
          payload: JSON.stringify(payload),
        }),
      );
    });

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "one" } });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "two" } });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByLabelText("Title")).toBeDefined();
  });
});

describe("a shell that says too little", () => {
  it("registers the column renderers too, not only the fields", () => {
    // `columns.tsx` does not register on import — the package declares no
    // JavaScript side effects, so a bundler may drop a module-scope call. Which
    // makes this the only thing standing between a built panel and a table of
    // question marks.
    resetColumnRegistry();
    expect(lookupColumn("TextColumn")).toBeUndefined();

    act(() => {
      mount(
        element({
          api: "/admin/api/people",
          operation: "create",
          payload: JSON.stringify(payload),
        }),
      );
    });

    expect(lookupColumn("TextColumn")).toBeDefined();
    expect(lookupColumn("IconColumn")).toBeDefined();
  });

  it("mounts the panel menu from the element, on a form page", () => {
    act(() => {
      mount(
        element({
          api: "/admin/api/people",
          operation: "create",
          title: "Create Person",
          navigation: JSON.stringify([
            { items: [{ label: "People", href: "/admin/people" }] },
          ]),
          payload: JSON.stringify(payload),
        }),
      );
    });

    expect(screen.getByRole("navigation", { name: "Panel" })).toBeTruthy();
  });

  it("shows no menu when the shell sent none", () => {
    act(() => {
      mount(
        element({
          api: "/admin/api/people",
          operation: "create",
          title: "Create Person",
          payload: JSON.stringify(payload),
        }),
      );
    });

    expect(screen.queryByRole("navigation", { name: "Panel" })).toBeNull();
  });

  it("puts the trail back on a form page, from the element", () => {
    // Removing the breadcrumb from `mount` failed no test at all, which is the
    // same gap the column registration had: a component nobody asserts is
    // mounted is a component that can quietly stop being.
    act(() => {
      mount(
        element({
          api: "/admin/api/people",
          operation: "create",
          title: "Create Person",
          listPath: "/admin/people",
          listLabel: "People",
          payload: JSON.stringify(payload),
        }),
      );
    });

    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "People" }).getAttribute("href")).toBe(
      "/admin/people",
    );
  });

  it("shows no trail when the server sent no path for one", () => {
    act(() => {
      mount(
        element({
          api: "/admin/api/people",
          operation: "create",
          title: "Create Person",
          payload: JSON.stringify(payload),
        }),
      );
    });

    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("takes the list's title from the element, not from the document", () => {
    // `panel-shell.ts` states the contract: everything the bundle needs travels
    // on the mount element. Reading `document.title` worked and was a coupling
    // that file rules out.
    document.title = "not this";
    act(() => {
      mount(
        element({
          api: "/admin/api/people",
          operation: "list",
          title: "People",
          payload: JSON.stringify({ rows: [], total: 0, columns: { columns: [] } }),
        }),
      );
    });

    expect(screen.getByRole("heading", { name: "People" })).toBeTruthy();
  });

  it("puts the page and the order in the query string it fetches", async () => {
    // The seam between the controls and the route. `PanelList` asks for a page
    // through a callback; nothing but mounting says the callback turns that
    // into a URL `records-query.ts` can read.
    const listing = {
      rows: [{ id: 1, title: "Ada" }],
      total: 6,
      page: 1,
      perPage: 2,
      columns: {
        columns: [
          { type: "TextColumn", path: "title", label: "Headline", sortable: true },
        ],
        actions: [],
        headerActions: [],
        defaultSort: { path: "title", direction: "asc" },
      },
      recordKey: "id",
      resourcePath: "/admin/people",
    };
    // Restubbed rather than re-implemented: `/records` answers with a listing,
    // not with the schema payload the other tests here are about.
    fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(listing) }),
    );
    vi.stubGlobal("fetch", fetchMock);

    act(() => {
      mount(
        element({
          api: "/admin/api/people",
          operation: "list",
          title: "People",
          payload: JSON.stringify(listing),
        }),
      );
    });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [url] = callArgs(0);
    expect(url).toContain("/admin/api/people/records?");
    expect(url).toContain("page=2");
    expect(url).toContain(`sort=${encodeURIComponent("title:asc")}`);
  });

  it("refuses to mount rather than half working", () => {
    expect(() => {
      mount(element({ api: "/admin/api/people" }));
    }).toThrow(/data-api, data-operation and data-payload/);
  });
});
