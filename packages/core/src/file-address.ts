/**
 * A stored key becomes an address in one place, for everything that shows one.
 *
 * A table's picture column and an infolist's picture entry ask the same
 * question — what may a browser fetch for this row — and they used to answer it
 * in two files. One of them would have drifted; the one nobody was looking at.
 *
 * Two readings, and both are needed. The host turns a key into an address,
 * because only it knows the disk and only it can sign for a bucket. Then that
 * address is read like any other: a signed URL is exactly the kind of value
 * nobody should put into an attribute unread, and the row it came from is not
 * a place that vouches for anything.
 */
import { safeHref } from "./entries/text-entry.js";

/** What the host can turn a key on a disk into. */
export type FileUrl = (disk: string, key: string) => string | undefined;

/**
 * The address for a stored value, or nothing.
 *
 * No disk means the value is already an address and is read as one. A disk
 * means it is a key, and a host that cannot answer means no picture rather than
 * a broken one.
 */
export function fileAddress(
  value: unknown,
  disk: string | undefined,
  fileUrl: FileUrl | undefined,
): string | undefined {
  if (disk === undefined) return safeHref(value);
  if (typeof value !== "string" || value === "") return undefined;
  return safeHref(fileUrl?.(disk, value));
}
