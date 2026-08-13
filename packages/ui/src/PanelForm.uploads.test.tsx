/**
 * @vitest-environment jsdom
 *
 * The state the form holds travels with the file.
 *
 * The server resolves the tree before it looks the field up, so a field whose
 * visibility depends on another is invisible to an empty one — and somebody
 * looking straight at the control would be told it does not exist.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PanelFormProps } from "./PanelForm.js";
import { PanelForm } from "./PanelForm.js";
import { registerBuiltInComponents } from "./renderers.js";
import { resetRegistry } from "./registry.js";

afterEach(cleanup);

const PAYLOAD: SchemaPayload = {
  schema: {
    id: "0",
    type: "Schema",
    children: [
      { id: "kind", type: "TextInput", path: "kind", label: "Kind" },
      { id: "cover", type: "FileUpload", path: "cover", label: "Cover", props: {} },
    ],
  },
  state: { kind: "image", cover: "" },
  errors: {},
};

const STAGED = { key: "staging/1", name: "c.png", size: 4, type: "image/png" };

/** Typed through the prop: the call record is what these assert on. */
function draw(): () => readonly unknown[][] {
  resetRegistry();
  registerBuiltInComponents();
  const uploadFile: PanelFormProps["uploadFile"] = vi.fn(() => Promise.resolve(STAGED));

  render(
    <PanelForm
      initial={PAYLOAD}
      send={() => Promise.resolve({ payload: PAYLOAD })}
      uploadFile={uploadFile}
    />,
  );

  fireEvent.change(screen.getByLabelText("Cover"), {
    target: { files: [new File(["x"], "c.png", { type: "image/png" })] },
  });

  return () => (uploadFile as ReturnType<typeof vi.fn>).mock.calls;
}

describe("sending a file from a form", () => {
  it("carries the state the form is holding", async () => {
    const calls = draw();

    await waitFor(() => {
      expect(calls().length).toBeGreaterThan(0);
    });
    expect(calls()[0]?.[2]).toEqual({ kind: "image", cover: "" });
  });

  it("names the path the file belongs to", async () => {
    const calls = draw();

    await waitFor(() => {
      expect(calls()[0]?.[0]).toBe("cover");
    });
  });
});
