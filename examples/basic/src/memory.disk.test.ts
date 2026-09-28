/**
 * The disk this example ships keeps the port's contract.
 *
 * It is the adapter a reader is most likely to copy from, and until this file
 * nothing ran it: the panel's own suites each bring a disk of their own, so the
 * one on the page reached none of them. It was right, as it turns out. That was
 * not knowledge anybody had.
 *
 * The checks live in `@perchjs/testing` rather than here, because they are the
 * port's promises rather than this example's, and the same call is what a reader
 * runs against a disk of theirs.
 */
import { checkStorageAdapter } from "@perchjs/testing";
import { describe, expect, it } from "vitest";
import { MemoryDisk } from "./memory.disk.js";

describe("the example's memory disk", () => {
  it("keeps the storage contract", async () => {
    expect(await checkStorageAdapter(new MemoryDisk())).toEqual([]);
  });
});
