/**
 * `FileUpload` — a handle in the form, bytes in a store.
 *
 * The field's value is a key the storage adapter issued, not a path and not a
 * name: a reader who could choose the path could choose somebody else's, and a
 * name is theirs to pick and therefore theirs to weaponise. The key is opaque
 * to everything above the adapter.
 *
 * `.maxSize()` and `.acceptedFileTypes()` are the upload route's, not the
 * browser's. A file input's `accept` is a filter over a dialog and a `size`
 * check in the page is a courtesy; both are gone the moment somebody posts to
 * the route directly, which is where these are enforced.
 */
import { configured } from "../component.js";
import type { FieldState, ValueRefusal } from "../field.js";
import { baseFieldState, Field, isUnset } from "../field.js";

export interface FileUploadState extends FieldState {
  /** Which of the disks the panel was given. */
  readonly disk: string;
  /** Where committed files land on it. */
  readonly directory: string;
  /** Bytes. Refused by the route, not by the page. */
  readonly maxSize?: number;
  /** Media types, exact or with a `*` subtype: `image/png`, `image/*`. */
  readonly acceptedFileTypes?: readonly string[];
}

const DEFAULT_DISK = "default";

export class FileUpload extends Field {
  declare readonly state: FileUploadState;

  override get type(): string {
    return "FileUpload";
  }

  protected override with(patch: Partial<FileUploadState>): this {
    return super.with(patch);
  }

  /** Choosing a file is a decision, not typing. */
  protected override get defaultDebounce(): number {
    return 0;
  }

  static make(name: string): FileUpload {
    const state: FileUploadState = {
      ...baseFieldState(name),
      disk: DEFAULT_DISK,
      directory: "",
    };
    return configured(new FileUpload(state));
  }

  disk(name: string): this {
    return this.with({ disk: name });
  }

  directory(path: string): this {
    return this.with({ directory: path });
  }

  maxSize(bytes: number): this {
    return this.with({ maxSize: bytes });
  }

  acceptedFileTypes(types: readonly string[]): this {
    return this.with({ acceptedFileTypes: [...types] });
  }

  /** Convenience for the common set, and no more permissive than naming them. */
  image(): this {
    return this.acceptedFileTypes([
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
    ]);
  }

  /**
   * A key, and nothing else.
   *
   * The route hands one back and the form sends it again; anything else is a
   * client naming a file it was never given, which is how one row comes to
   * point at another's attachment.
   */
  override admits(value: unknown): ValueRefusal | undefined {
    if (isUnset(value)) return undefined;
    return typeof value === "string" ? undefined : "wrong-shape";
  }

  /** Whether a reported media type is one this field said it would take. */
  accepts(type: string): boolean {
    const allowed = this.state.acceptedFileTypes;
    if (allowed === undefined) return true;
    return allowed.some((pattern) => {
      if (pattern === type) return true;
      // `image/*` and nothing looser: a bare `*` would be the absence of a rule
      // written as though it were one.
      const [family, subtype] = pattern.split("/");
      return subtype === "*" && family !== undefined && type.startsWith(`${family}/`);
    });
  }
}
