/**
 * The browser half of a field the framework does not ship.
 *
 * Loaded by the panel after its own bundle, so `window.perch` is there, and
 * before it draws anything, so the registration counts. Plain JavaScript: a
 * renderer with no bundler has no JSX, which is why `createElement` comes with
 * the registry.
 */
const { registerComponent, createElement: h } = window.perch;

/*
 * A plugin ships its own styling, and there is no stylesheet to add it to — so
 * it is put on the page once, here, beside the field it belongs to.
 *
 * Written against the panel's own custom properties rather than against
 * colours. That is the whole point of them being custom properties: a field the
 * framework never heard of takes the accent, the muted grey and the focus ring
 * the rest of the page uses, and follows a theme it does not know exists.
 *
 * The panel's focus floor matches its own class prefix, which this field does
 * not carry, so the ring is asked for by name.
 */
if (!document.getElementById("stars-style")) {
  const style = document.createElement("style");
  style.id = "stars-style";
  style.textContent = `
    .stars {
      display: flex;
      gap: var(--perch-space-2, 4px);
      margin: 0;
      padding: 0;
      border: 0;
    }
    .stars legend {
      padding: 0;
      color: var(--perch-content-secondary, #4b5563);
      font-size: var(--perch-text-sm, 0.8125rem);
    }
    .stars button {
      padding: 0 2px;
      border: 0;
      border-radius: var(--perch-radius-sm, 4px);
      background: none;
      /* The unpicked ones stay legible rather than disappearing: a row of
         nearly invisible stars reads as four stars out of four. */
      color: var(--perch-content-subtle, #9aa4ab);
      font-size: 1.35rem;
      line-height: 1.2;
      cursor: pointer;
    }
    .stars button[aria-pressed="true"] {
      color: var(--perch-warning-content, #8a5a00);
    }
    .stars button:hover {
      color: var(--perch-warning-content, #8a5a00);
    }
    .stars button:focus-visible {
      outline: none;
      box-shadow: var(--perch-focus-ring, 0 0 0 3px rgb(33 89 74 / 0.28));
    }
  `;
  document.head.append(style);
}

registerComponent("StarRating", ({ node, value, onChange }) => {
  const most = typeof node.props?.most === "number" ? node.props.most : 5;
  const picked = typeof value === "number" ? value : 0;

  return h(
    "fieldset",
    { className: "stars" },
    h("legend", null, node.label ?? node.path),
    Array.from({ length: most }, (_, at) =>
      h(
        "button",
        {
          key: at,
          type: "button",
          "aria-pressed": at < picked,
          "aria-label": `${String(at + 1)} of ${String(most)}`,
          // The path, then the value. A renderer names the path it writes
          // because one component can hold several — a repeater's row does.
          onClick: () => {
            onChange(node.path, at + 1);
          },
        },
        at < picked ? "★" : "☆",
      ),
    ),
  );
});
