/**
 * The adapter this example ships keeps the port's contract.
 *
 * Seven hundred lines honouring the sort, the page, the clauses a filter
 * produced, the search and the include a relation column asked for — and until
 * this file nothing ran any of it. It is also the adapter a reader copies from,
 * which is the same reason the disk beside it has a test.
 *
 * The checks live in `@perchjs/testing` rather than here: they are the port's
 * promises rather than this example's, and the same call is what a reader runs
 * against an adapter of theirs.
 */
import { checkDataAdapter } from "@perchjs/testing";
import { describe, expect, it } from "vitest";
import { MemoryAdapter } from "./memory.adapter.js";

describe("the example's memory adapter", () => {
  it("keeps the data contract", async () => {
    const said = await checkDataAdapter(new MemoryAdapter(), {
      model: "Person",
      // Tied on the country, so the order between them is the adapter's to
      // settle rather than the sort's.
      rows: [
        { set: { firstName: "Ada", lastName: "Byron", country: "uk" } },
        { set: { firstName: "Grace", lastName: "Hopper", country: "uk" } },
        { set: { firstName: "Mei", lastName: "Harada", country: "uk" } },
      ],
      tiedOn: "country",
    });

    expect(said).toEqual([]);
  });
});
