/**
 * The dataset, and the thing that puts it back.
 *
 * A public demo is edited by strangers, which is the point: a visitor who may
 * not create, edit and delete has not seen the panel. So the data is restored
 * on a schedule rather than protected, and deleting a row is something to try
 * rather than something to regret.
 *
 * Real species, real Latin names, real conservation categories. A demo seeded
 * with `Test 1`, `Test 2` teaches a reader that the panel draws rows; one
 * seeded with something true lets them judge whether the table reads well.
 */
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

const SPECIES = [
  ["Eurasian Wren", "Troglodytes troglodytes", "Troglodytidae", "least"],
  ["European Robin", "Erithacus rubecula", "Muscicapidae", "least"],
  ["Barn Owl", "Tyto alba", "Tytonidae", "least"],
  ["Northern Lapwing", "Vanellus vanellus", "Charadriidae", "near"],
  ["Eurasian Curlew", "Numenius arquata", "Scolopacidae", "near"],
  ["Atlantic Puffin", "Fratercula arctica", "Alcidae", "vulnerable"],
  ["European Turtle Dove", "Streptopelia turtur", "Columbidae", "vulnerable"],
  ["Balearic Shearwater", "Puffinus mauretanicus", "Procellariidae", "endangered"],
  ["Common Kingfisher", "Alcedo atthis", "Alcedinidae", "least"],
  ["Grey Heron", "Ardea cinerea", "Ardeidae", "least"],
  ["Red Kite", "Milvus milvus", "Accipitridae", "least"],
  ["Willow Tit", "Poecile montanus", "Paridae", "vulnerable"],
] as const;

const OBSERVERS = [
  ["Ada Fenwick", "ada@example.org"],
  ["Grace Mbeki", "grace@example.org"],
  ["Tomas Lindqvist", "tomas@example.org"],
  ["Rosa Duarte", "rosa@example.org"],
  ["Kwame Asante", "kwame@example.org"],
  ["Mei Harada", "mei@example.org"],
] as const;

const SITES = [
  ["Bramble Marsh", "Norfolk", "wetland"],
  ["Ashdown Ridge", "Sussex", "woodland"],
  ["Skomer Cliffs", "Pembrokeshire", "coast"],
  ["Ilkley Moor", "Yorkshire", "moorland"],
  ["Canal Basin", "Birmingham", "urban"],
  ["Leighton Reeds", "Bedfordshire", "wetland"],
  ["Glen Affric", "Highland", "woodland"],
  ["Spurn Point", "Yorkshire", "coast"],
] as const;

const CERTAINTY = ["certain", "certain", "certain", "probable", "possible"] as const;

/** Deterministic, so two runs of the demo show the same table. */
function* sequence(seed: number): Generator<number> {
  let value = seed;
  for (;;) {
    value = (value * 1103515245 + 12345) % 2147483648;
    yield value / 2147483648;
  }
}

@Injectable()
export class Seed implements OnApplicationBootstrap, OnModuleDestroy {
  readonly #log = new Logger("Seed");
  #timer: NodeJS.Timeout | undefined;

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.restore();

    const minutes = Number(process.env["DEMO_RESET_MINUTES"] ?? 60);
    if (minutes <= 0) {
      this.#log.log("Resetting is off. The data is whatever visitors leave behind.");
      return;
    }
    this.#timer = setInterval(() => {
      void this.restore().catch((error: unknown) => {
        this.#log.error(`Could not restore the demo data: ${String(error)}`);
      });
    }, minutes * 60_000);
    // Otherwise the interval alone keeps the process alive for ever, and a
    // container that will not stop is a container somebody kills.
    this.#timer.unref();
    this.#log.log(
      `The data goes back to how it started every ${String(minutes)} minutes.`,
    );
  }

  onModuleDestroy(): void {
    if (this.#timer !== undefined) clearInterval(this.#timer);
  }

  /** Everything, in one transaction: a half-seeded demo is worse than none. */
  async restore(): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.sighting.deleteMany({});
      await tx.species.deleteMany({});
      await tx.observer.deleteMany({});
      await tx.site.deleteMany({});

      const species = await Promise.all(
        SPECIES.map(async ([commonName, latinName, family, status]) =>
          tx.species.create({
            data: {
              commonName,
              latinName,
              family,
              status,
              photoUrl: `/demo-images/${commonName.replace(/\s+/g, "-")}.svg`,
            },
          }),
        ),
      );
      const observers = await Promise.all(
        OBSERVERS.map(async ([name, email]) =>
          tx.observer.create({
            data: {
              name,
              email,
              avatarUrl: `/demo-images/${name.replace(/\s+/g, "-")}.svg`,
            },
          }),
        ),
      );
      const sites = await Promise.all(
        SITES.map(async ([name, region, habitat]) =>
          tx.site.create({ data: { name, region, habitat } }),
        ),
      );

      const random = sequence(20260916);
      const day = 86_400_000;
      const rows = Array.from({ length: 140 }, (_, index) => {
        // `noUncheckedIndexedAccess` is right to insist: the index is computed,
        // so nothing can prove it is in range. Checked rather than asserted
        // away, because a seed that quietly writes `undefined` into a foreign
        // key is a demo that starts with a broken table and no reason for it.
        const pick = <T>(list: readonly T[]): T => {
          const at = Math.floor((random.next().value ?? 0) * list.length);
          const chosen = list[at] ?? list[0];
          if (chosen === undefined) throw new Error("nothing seeded to choose from");
          return chosen;
        };
        return {
          seenAt: new Date(
            Date.now() - Math.floor((random.next().value ?? 0) * 180) * day,
          ),
          count: 1 + Math.floor((random.next().value ?? 0) * 12),
          certainty: pick(CERTAINTY),
          confirmed: (random.next().value ?? 0) > 0.45,
          notes: index % 7 === 0 ? "Heard before it was seen." : null,
          speciesId: pick(species).id,
          observerId: pick(observers).id,
          siteId: pick(sites).id,
        };
      });
      await tx.sighting.createMany({ data: rows });
    });

    this.#log.log(
      `Seeded ${String(SPECIES.length)} species, ${String(OBSERVERS.length)} observers, ` +
        `${String(SITES.length)} sites and 140 sightings.`,
    );
  }
}
