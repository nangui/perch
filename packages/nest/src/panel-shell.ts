/**
 * The one page the panel is served as.
 *
 * Everything the bundle needs travels on the mount element, so the same file
 * works under any prefix. The payload is record data going into an attribute:
 * without escaping, a title of `" onmouseover="…` closes the attribute and the
 * panel executes whatever follows.
 */
export interface ShellOptions {
  /** Absolute path the panel is mounted at, no trailing slash. */
  readonly root: string;
  /** Where `/state` and its siblings live, e.g. `/admin/api/people`. */
  readonly api: string;
  readonly title: string;
  readonly payload: unknown;
  readonly scriptFile: string;
  readonly styleFile: string;
}

export function renderShell(options: ShellOptions): string {
  const payload = attribute(JSON.stringify(options.payload));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${text(options.title)}</title>
<link rel="stylesheet" href="${attribute(`${options.root}/assets/${options.styleFile}`)}">
</head>
<body class="perch-root">
<div id="perch-panel" data-api="${attribute(options.api)}" data-payload="${payload}"></div>
<script type="module" src="${attribute(`${options.root}/assets/${options.scriptFile}`)}"></script>
</body>
</html>
`;
}

/**
 * `&` first, or the entities this produces get escaped a second time. `'` is
 * escaped too: the attributes above are double-quoted, but a template that
 * changes its mind later should not become a hole.
 */
function attribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function text(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
