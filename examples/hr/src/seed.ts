/**
 * The dataset, and the thing that puts it back.
 *
 * A panel anybody may edit is a panel somebody will empty, which is the point:
 * a visitor who may not create, edit and delete has not seen it. So the data is
 * restored on a schedule rather than protected.
 *
 * Real job titles, real departments, hours that add up. A panel seeded with
 * `Test 1`, `Test 2` teaches a reader that it draws rows; one seeded with
 * something plausible lets them judge whether the table reads well.
 */
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";

import { PrismaService } from "./prisma.service.js";

const DEPARTMENTS = [
  ["Engineering", "ENG"],
  ["Design", "DSN"],
  ["People", "PPL"],
  ["Finance", "FIN"],
  ["Support", "SUP"],
] as const;

/** name, email, job title, department code, employment, salary, weekly hours */
const PEOPLE = [
  ["Laura Jensen", "laura@example.org", "Head of Engineering", "ENG", "full", 7400, 40],
  ["David Miller", "david@example.org", "Backend Engineer", "ENG", "full", 5200, 40],
  ["Grace Taylor", "grace@example.org", "Frontend Engineer", "ENG", "full", 5100, 40],
  [
    "Kevin White",
    "kevin@example.org",
    "Platform Engineer",
    "ENG",
    "contract",
    6000,
    32,
  ],
  ["Mei Harada", "mei@example.org", "Product Designer", "DSN", "full", 4800, 40],
  ["Tomas Lindqvist", "tomas@example.org", "Design Lead", "DSN", "full", 6100, 40],
  ["Rosa Duarte", "rosa@example.org", "People Partner", "PPL", "full", 4600, 40],
  ["Kwame Asante", "kwame@example.org", "Recruiter", "PPL", "part", 2600, 24],
  ["Ada Fenwick", "ada@example.org", "Financial Controller", "FIN", "full", 5900, 40],
  ["Noor Haddad", "noor@example.org", "Support Engineer", "SUP", "full", 3900, 40],
  ["Jonas Berg", "jonas@example.org", "Support Engineer", "SUP", "part", 2300, 20],
  ["Priya Nair", "priya@example.org", "Data Analyst", "FIN", "contract", 4400, 32],
] as const;

const PROJECTS = [
  "Operation Nightwatch",
  "Project Starburst",
  "Initiative Blue Sky",
  "Task Force Omega",
  "Mission Apollo",
  "Project Blue Beam",
] as const;

const NOTES = [
  "System deployment, debugging",
  "Data analysis, model training",
  "Market research, strategy planning",
  "Budget allocation, resourcing",
  "Backend development, API integration",
  "Database optimisation, service health",
] as const;

const KINDS = ["holiday", "sick", "parental", "unpaid"] as const;
const STATUSES = ["pending", "approved", "rejected"] as const;

/**
 * The same rows every time, which is what makes a screenshot worth comparing
 * with the one before it. `Math.random` would reseed on every restore.
 */
function* sequence(seed: number): Generator<number, never, void> {
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
        this.#log.error(`Could not restore the data: ${String(error)}`);
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

  /** Everything, in one transaction: a half-seeded panel is worse than none. */
  async restore(): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.timeLog.deleteMany({});
      await tx.leaveRequest.deleteMany({});
      await tx.employee.deleteMany({});
      await tx.department.deleteMany({});

      const departments = new Map<string, number>();
      for (const [name, code] of DEPARTMENTS) {
        const row = await tx.department.create({ data: { name, code } });
        departments.set(code, row.id);
      }

      const random = sequence(20261008);
      const day = 86_400_000;
      const now = Date.now();

      // Everyone, with nobody reporting to anybody yet: a manager has to exist
      // before somebody can point at them, and the first row cannot wait for
      // the last.
      const people: { id: number; code: string }[] = [];
      for (const [
        name,
        email,
        jobTitle,
        code,
        employment,
        salary,
        weeklyHours,
      ] of PEOPLE) {
        const row = await tx.employee.create({
          data: {
            name,
            email,
            jobTitle,
            employment,
            salary,
            weeklyHours,
            departmentId: departments.get(code) ?? 0,
            avatarUrl: `/demo-images/${name.replace(/\s+/g, "-")}.svg`,
            hiredAt: new Date(now - Math.floor(next(random) * 900) * day),
          },
        });
        people.push({ id: row.id, code });
      }

      // The first person in each department leads it, and everybody else there
      // reports to them. A head reports to nobody, which is the null the
      // relation is allowed to hold.
      const heads = new Map<string, number>();
      for (const one of people) if (!heads.has(one.code)) heads.set(one.code, one.id);
      for (const one of people) {
        const head = heads.get(one.code);
        if (head === undefined || head === one.id) continue;
        await tx.employee.update({ where: { id: one.id }, data: { managerId: head } });
      }

      for (let index = 0; index < 180; index += 1) {
        const who = people[Math.floor(next(random) * people.length)];
        if (who === undefined) continue;
        const started = new Date(
          now -
            Math.floor(next(random) * 60) * day -
            Math.floor(next(random) * 9) * 3_600_000,
        );
        const length = 6 + Math.floor(next(random) * 4);
        await tx.timeLog.create({
          data: {
            employeeId: who.id,
            project: pick(PROJECTS, random),
            notes: pick(NOTES, random),
            status: pick(STATUSES, random),
            startedAt: started,
            endedAt: new Date(started.getTime() + length * 3_600_000),
          },
        });
      }

      for (let index = 0; index < 26; index += 1) {
        const who = people[Math.floor(next(random) * people.length)];
        if (who === undefined) continue;
        const from = new Date(now + (Math.floor(next(random) * 80) - 30) * day);
        const nights = 1 + Math.floor(next(random) * 10);
        await tx.leaveRequest.create({
          data: {
            employeeId: who.id,
            kind: pick(KINDS, random),
            status: pick(STATUSES, random),
            startsOn: from,
            endsOn: new Date(from.getTime() + nights * day),
            reason: next(random) > 0.6 ? "Booked in advance" : null,
          },
        });
      }
    });

    this.#log.log("The data is back to how it started.");
  }
}

/**
 * The next number. The generator says it returns `never`, which is true of one
 * that loops for ever and is what lets this read the value without a fallback
 * for a case that cannot happen.
 */
function next(random: Generator<number, never, void>): number {
  return random.next().value;
}

function pick<T>(
  from: readonly [T, ...T[]],
  random: Generator<number, never, void>,
): T {
  // The type carries the thing the cast was asserting: a list with at least one
  // element, so the first one is always there and nothing has to be claimed
  // about the computed index.
  return from[Math.floor(next(random) * from.length)] ?? from[0];
}
