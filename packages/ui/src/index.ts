/**
 * `@perchjs/ui` — the React renderer and its component registry.
 *
 * Imports `@perchjs/core` for types only, which is why core sits in
 * devDependencies here: no core value reaches the browser bundle.
 *
 * Shipped precompiled and served as static assets by the PanelModule. The user
 * configures neither Vite, Webpack nor Tailwind — that is the product promise
 * (ARCH 13 §, PRD 03).
 */

export const PERCH_UI_STATUS = "pre-implementation" as const;
