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
  /** The document title, and — on a list — the table's caption. */
  readonly title: string;
  /**
   * What the bundle should mount. `create` and `edit` are what the form will do
   * when submitted; `list` is a table, and carries a page of records rather
   * than a resolved tree.
   */
  readonly operation: "create" | "edit" | "list";
  /** The row being edited. Absent on a create and on a list. */
  readonly id?: string;
  /**
   * The resource's list page and its name, for the trail back. Absent when the
   * root it was built from is not one this origin owns — a breadcrumb off the
   * site is the same hole as a row action off the site.
   */
  readonly listPath?: string;
  readonly listLabel?: string;
  /** The panel's own menu, already filtered by what this user may reach. */
  readonly navigation?: unknown;
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
<div id="perch-panel" data-api="${attribute(options.api)}" data-operation="${attribute(options.operation)}"${
    options.id === undefined ? "" : ` data-id="${attribute(options.id)}"`
  }${options.listPath === undefined ? "" : ` data-list-path="${attribute(options.listPath)}"`}${
    options.listLabel === undefined
      ? ""
      : ` data-list-label="${attribute(options.listLabel)}"`
  }${
    options.navigation === undefined
      ? ""
      : ` data-navigation="${attribute(JSON.stringify(options.navigation))}"`
  } data-title="${attribute(options.title)}" data-payload="${payload}"></div>
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
