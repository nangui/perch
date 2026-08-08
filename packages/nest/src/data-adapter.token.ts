/**
 * The outbound port, as the panel reaches it. `@perchjs/core` defines the shape;
 * nothing here knows which database is behind it.
 */
export const PANEL_DATA_ADAPTER = Symbol("PERCH_PANEL_DATA_ADAPTER");
