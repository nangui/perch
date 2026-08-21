/**
 * The browser half of a field the framework does not ship.
 *
 * Loaded by the panel after its own bundle, so `window.perch` is there, and
 * before it draws anything, so the registration counts. Plain JavaScript: a
 * renderer with no bundler has no JSX, which is why `createElement` comes with
 * the registry.
 */
const { registerComponent, createElement: h } = window.perch;

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
