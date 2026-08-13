/**
 * The disks a panel was given, by the names a form may pick among.
 *
 * A record rather than a single adapter, because `.disk()` exists: a panel may
 * keep avatars on one store and invoices on another, and the field names which
 * without knowing what either is.
 *
 * Empty is the default and a legitimate state — a panel with no `FileUpload`
 * needs no disk — so the audit is what stops a form naming one that is not
 * there, at boot, rather than the first upload failing under a reader.
 */
import type { StorageAdapter } from "@perchjs/core";

export const PANEL_STORAGE = Symbol("PERCH_PANEL_STORAGE");

export type PanelDisks = Readonly<Record<string, StorageAdapter>>;
