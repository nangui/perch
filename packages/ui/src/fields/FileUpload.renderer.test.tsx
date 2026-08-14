/**
 * @vitest-environment jsdom
 *
 * The harness is controlled, because a host is: `onChange` puts the value back
 * and the control re-renders holding it. A spy that swallowed the change would
 * be pretending the round trip never happens, and every assertion about what
 * the control shows afterwards would be about a state no panel is ever in.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UploadedFile } from "../node-props.js";
import { registerBuiltInComponents } from "../renderers.js";
import { resetRegistry } from "../registry.js";
import { SchemaRenderer } from "../SchemaRenderer.js";

afterEach(cleanup);

const STAGED: UploadedFile = {
  key: "staging/1",
  name: "cover.png",
  size: 2048,
  type: "image/png",
};

type Upload = ((path: string, file: File) => Promise<UploadedFile>) | null;

function Panel({
  start,
  upload,
  props,
  onChange,
  answer,
}: {
  readonly start: string;
  readonly upload: Upload;
  readonly props: Record<string, unknown>;
  readonly onChange: (path: string, value: unknown) => void;
  /** What the server puts back. Defaults to what the control reported. */
  readonly answer?: string;
}): React.ReactNode {
  const [value, setValue] = useState(start);
  const payload: SchemaPayload = {
    schema: {
      id: "0",
      type: "Schema",
      children: [
        { id: "cover", type: "FileUpload", path: "cover", label: "Cover", props },
      ],
    },
    state: { cover: value },
    errors: {},
  };

  return (
    <SchemaRenderer
      payload={payload}
      onChange={(path, next) => {
        onChange(path, next);
        setValue(answer ?? String(next));
      }}
      {...(upload === null ? {} : { uploadFile: upload })}
    />
  );
}

function draw(
  start: string,
  // `null` for absent, never `undefined`: passing `undefined` to a parameter
  // with a default gets the default, which is how a test here once passed
  // while proving the opposite of what it said.
  upload: Upload = () => Promise.resolve(STAGED),
  props: Record<string, unknown> = { disk: "default", maxSize: 1_048_576 },
  answer?: string,
): ReturnType<typeof vi.fn> {
  const onChange = vi.fn();
  resetRegistry();
  registerBuiltInComponents();
  render(
    <Panel
      start={start}
      upload={upload}
      props={props}
      onChange={onChange}
      {...(answer === undefined ? {} : { answer })}
    />,
  );
  return onChange;
}

const box = (): HTMLInputElement => screen.getByLabelText("Cover");

const pick = (name = "cover.png", type = "image/png"): void => {
  fireEvent.change(box(), { target: { files: [new File(["x"], name, { type })] } });
};

describe("a FileUpload a form declared", () => {
  it("reaches the page as a real file input", () => {
    draw("");

    expect(box().type).toBe("file");
  });

  it("says what the limit is before anything is chosen", () => {
    draw("");

    expect(screen.getByText("Up to 1 MB")).toBeTruthy();
  });

  it("passes the accepted types to the dialog as a courtesy", () => {
    draw("", null, { disk: "d", acceptedFileTypes: ["image/png", "image/gif"] });

    expect(box().getAttribute("accept")).toBe("image/png,image/gif");
  });
});

describe("choosing a file", () => {
  it("sends it and reports the key the server issued", async () => {
    const onChange = draw("");

    pick();

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("cover", "staging/1");
    });
  });

  it("names the file it is holding once the server took it", async () => {
    draw("");

    pick();

    await waitFor(() => {
      expect(screen.getByText("cover.png · 2 KB")).toBeTruthy();
    });
  });

  it("says it is sending while it is", async () => {
    let settle: ((file: UploadedFile) => void) | undefined;
    draw("", () => new Promise<UploadedFile>((resolve) => (settle = resolve)));

    pick();

    await waitFor(() => {
      expect(screen.getByText("Sending…")).toBeTruthy();
    });
    settle?.(STAGED);
  });
});

describe("a file the server refuses", () => {
  it("shows what the server said, because it knows the limit", async () => {
    const onChange = draw("", () =>
      Promise.reject(new Error("That file is 2000 bytes, and the limit is 1000.")),
    );

    pick();

    await waitFor(() => {
      expect(
        screen.getByText("That file is 2000 bytes, and the limit is 1000."),
      ).toBeTruthy();
    });
    // Nothing was attached, so nothing was reported.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stops saying it is sending", async () => {
    draw("", () => Promise.reject(new Error("no")));

    pick();

    await waitFor(() => {
      expect(screen.queryByText("Sending…")).toBeNull();
    });
  });
});

describe("a field that already holds one", () => {
  it("says so, and offers to take it off", () => {
    draw("covers/7");

    expect(screen.getByText("A file is attached")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
  });

  it("clears the value when it is taken off", () => {
    const onChange = draw("covers/7");

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onChange).toHaveBeenCalledWith("cover", "");
  });

  it("offers nothing to remove when it holds nothing", () => {
    draw("");

    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });
});

describe("a host that cannot send", () => {
  it("says so rather than taking a file it would drop", () => {
    draw("", null);

    expect(screen.getByText("Uploading is not available here")).toBeTruthy();
    expect(box().disabled).toBe(true);
  });
});

describe("a value the server sent back different", () => {
  it("stops naming a file the field no longer holds", async () => {
    // The server is authoritative. Remembering the name past the answer that
    // cleared it leaves the note saying `cover.png` beside a control offering
    // nothing to remove, and a reader would save believing it was attached.
    draw("", () => Promise.resolve(STAGED), { disk: "default" }, "");

    pick();

    await waitFor(() => {
      expect(box().disabled).toBe(false);
    });
    expect(screen.queryByText("cover.png · 2 KB")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });
});

describe("while a file is going up", () => {
  it("takes no second one, so two answers cannot cross", () => {
    // One in flight per control, which is what makes a late answer from an
    // earlier choice impossible rather than merely unlikely.
    let settle: ((file: UploadedFile) => void) | undefined;
    draw("", () => new Promise<UploadedFile>((resolve) => (settle = resolve)));

    pick();

    expect(box().disabled).toBe(true);
    settle?.(STAGED);
  });
});

describe("the picture of what is attached", () => {
  it("is the address the server sent, for a file the row already holds", () => {
    draw("avatars/1.png", () => Promise.resolve(STAGED), {
      previewUrl: "https://cdn/avatars/1.png",
    });

    expect(image()?.getAttribute("src")).toBe("https://cdn/avatars/1.png");
  });

  it("is absent when the server sent no address", () => {
    draw("avatars/1.png", () => Promise.resolve(STAGED), {});

    expect(image()).toBeNull();
  });

  it("goes when the file goes, rather than outliving what it pictured", async () => {
    draw("avatars/1.png", () => Promise.resolve(STAGED), {
      previewUrl: "https://cdn/avatars/1.png",
    });

    screen.getByRole("button", { name: "Remove" }).click();

    await waitFor(() => {
      expect(image()).toBeNull();
    });
  });

  it("is the file just chosen, which the server was never asked about", async () => {
    // The server resolves an address only for what the row holds. A fresh
    // choice is pictured from the file itself, and the stale address the row
    // came with must not be what is shown.
    const made: string[] = [];
    const url = globalThis.URL as unknown as {
      createObjectURL: (blob: Blob) => string;
      revokeObjectURL: (value: string) => void;
    };
    url.createObjectURL = () => {
      made.push("made");
      return "blob:fresh";
    };
    url.revokeObjectURL = () => undefined;

    draw("avatars/1.png", () => Promise.resolve(STAGED), {
      previewUrl: "https://cdn/avatars/1.png",
    });

    pick();

    await waitFor(() => {
      expect(image()?.getAttribute("src")).toBe("blob:fresh");
    });
    expect(made).toHaveLength(1);
  });
});

/** The preview is decorative, so it is found by its class rather than a role. */
function image(): Element | null {
  return document.querySelector(".perch-upload__preview");
}
