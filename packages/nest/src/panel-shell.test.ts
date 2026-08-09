/**
 * The payload is record data going into an HTML attribute. Every case below is
 * a way out of that attribute.
 */
import { describe, expect, it } from "vitest";
import { renderShell } from "./panel-shell.js";

function shell(payload: unknown, title = "New Person"): string {
  return renderShell({
    root: "/admin",
    api: "/admin/api/people",
    operation: "create",
    title,
    payload,
    scriptFile: "panel-a1b2c3d4.js",
    styleFile: "panel-e5f6a7b8.css",
  });
}

function rawPayload(html: string): string {
  return /data-payload="([^"]*)"/.exec(html)?.[1] ?? "";
}

/**
 * Decoded by hand, which alone would be checking the escaping against its own
 * inverse — both wrong in the same way still passes. The assertion that carries
 * the security property is the one below on the raw value: a value holding no
 * `"`, `<` or `>` cannot be anything but one attribute, whatever parses it.
 */
function payloadOf(html: string): unknown {
  return JSON.parse(
    rawPayload(html)
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&"),
  );
}

describe("the payload survives the attribute", () => {
  it("comes back exactly as it went in", () => {
    const payload = {
      schema: { id: "0", type: "Schema" },
      state: { title: 'He said "hello" & <b>left</b>' },
      errors: {},
    };

    expect(payloadOf(shell(payload))).toEqual(payload);
  });

  it.each([
    ["a quote that would close the attribute", '" onmouseover="alert(1)'],
    ["a tag", "<script>alert(1)</script>"],
    ["an entity that must not be decoded twice", "&quot;&amp;&lt;"],
    ["a single quote", "it's fine"],
    ["a closing script tag", "</script><script>alert(1)</script>"],
  ])("holds on to %s", (_, value) => {
    const html = shell({ state: { title: value } });

    expect(rawPayload(html)).not.toMatch(/["<>]/);
    expect(payloadOf(html)).toEqual({ state: { title: value } });
    // And no tag the shell did not write itself.
    expect(html.match(/<script/g)).toHaveLength(1);
  });
});

describe("what the form will do when submitted", () => {
  it("says create, and names no row", () => {
    const html = shell({});

    expect(html).toContain('data-operation="create"');
    expect(html).not.toContain("data-id=");
  });

  it("says edit, and names the row", () => {
    const html = renderShell({
      root: "/admin",
      api: "/admin/api/people",
      operation: "edit",
      id: "42",
      title: "Edit",
      payload: {},
      scriptFile: "panel-a1b2c3d4.js",
      styleFile: "panel-e5f6a7b8.css",
    });

    expect(html).toContain('data-operation="edit"');
    expect(html).toContain('data-id="42"');
  });

  it("escapes the row, which arrives from a URL", () => {
    const html = renderShell({
      root: "/admin",
      api: "/admin/api/people",
      operation: "edit",
      id: '" onmouseover="alert(1)',
      title: "Edit",
      payload: {},
      scriptFile: "panel-a1b2c3d4.js",
      styleFile: "panel-e5f6a7b8.css",
    });

    expect(/data-id="([^"]*)"/.exec(html)?.[1]).not.toMatch(/["<>]/);
  });
});

describe("the rest of the page", () => {
  it("escapes the title", () => {
    expect(shell({}, "Order <b>#1</b> & co")).toContain(
      "<title>Order &lt;b&gt;#1&lt;/b&gt; &amp; co</title>",
    );
  });

  it("points at the hashed files under the panel root", () => {
    const html = shell({});

    expect(html).toContain('href="/admin/assets/panel-e5f6a7b8.css"');
    expect(html).toContain('src="/admin/assets/panel-a1b2c3d4.js"');
    expect(html).toContain('data-api="/admin/api/people"');
  });

  it("declares a language and a viewport", () => {
    // Without `lang` a screen reader guesses the pronunciation of every label.
    const html = shell({});

    expect(html).toContain('<html lang="en">');
    expect(html).toContain('name="viewport"');
  });

  it("loads the bundle as a module", () => {
    // It is ESM; a classic script tag fails on the first `import`.
    expect(shell({})).toContain('<script type="module"');
  });
});
