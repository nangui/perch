/**
 * Where a create lands: panel level, overridable per resource.
 *
 * The design names three targets: index, view, edit. `view` has no route yet —
 * it is the infolist, v0.2 — and accepting it would mean answering with a URL
 * that 404s. `index` arrived with the list page. What is offered is what exists.
 */
export const PANEL_REDIRECT_AFTER_CREATE = Symbol("PERCH_PANEL_REDIRECT_AFTER_CREATE");

export type RedirectAfterCreate = "edit" | "index" | "none";
