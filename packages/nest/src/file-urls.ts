/**
 * Turning a stored key into something a browser can fetch.
 *
 * A key is not an address. Where it resolves is the disk's business — a local
 * folder serves one path, an object store signs another — and neither the
 * domain nor the renderer has any way to guess. So the resolution cycle asks,
 * the same way it asks for a relationship's options, and this is the answer.
 */
import type { ResolveOptions } from "@perchjs/core";
import type { PanelDisks } from "./storage.token.js";

/**
 * A field naming a disk the panel was never given is a declaration error the
 * boot audit reports. Here it means no preview: a missing picture is a smaller
 * lie than a broken one, and the form still works without it.
 */
export function fileUrls(disks: PanelDisks): Pick<ResolveOptions, "fileUrl"> {
  return {
    fileUrl: (disk, key) => disks[disk]?.url(key),
  };
}
