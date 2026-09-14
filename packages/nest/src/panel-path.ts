/**
 * Where the panel is mounted, with its leading slash: `/admin`.
 *
 * Empty for one mounted at the root. Addresses are built from it, so it
 * carries the slash rather than leaving every reader to add one.
 *
 * Its own file, because the module reads it while building and a harness reads
 * it after: a token declared inside the module would be a token nothing
 * outside can import without importing the module that needs it.
 */
export const PANEL_PATH = Symbol("PERCH_PANEL_PATH");
