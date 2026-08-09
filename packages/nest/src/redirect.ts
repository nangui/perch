/**
 * Where a create lands.
 *
 * The design names three targets — index, view, edit — and two of them have no
 * route yet, so accepting them would mean answering with a URL that 404s. What
 * is offered is what exists.
 */
export const PANEL_REDIRECT_AFTER_CREATE = Symbol("PERCH_PANEL_REDIRECT_AFTER_CREATE");

export type RedirectAfterCreate = "edit" | "none";
