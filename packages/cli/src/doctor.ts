/**
 * `perch doctor` — what this project is missing, before it is run.
 *
 * The checks are a function of a reading of the project, not of the filesystem.
 * Gathering is in `index.ts` and is dull; deciding is here and is where every
 * case a user will actually hit can be written down without a temp directory.
 */
import { defaultSlug } from "@perchjs/core";

export type Level = "error" | "warning";

export interface Finding {
  readonly level: Level;
  readonly title: string;
  /** What to do about it. A diagnosis without one is just bad news. */
  readonly fix: string;
}

/** What the checks need to know. Absent means "could not be read". */
export interface Project {
  /** False when there is no package.json here at all. */
  readonly inProject: boolean;
  readonly dependencies: Readonly<Record<string, string>>;
  /** The installed Prisma version, as `node_modules` reports it. */
  readonly prismaVersion?: string;
  /** Every schema file, concatenated. */
  readonly schema?: string;
  /** That same schema fingerprinted, by the rule the generator writes with. */
  readonly schemaFingerprint?: string;
  /** Whether the generated IR is there, and what it was generated from. */
  readonly irPresent: boolean;
  readonly irSchemaHash?: string;
  /** Every `.ts` under the app's source root, for what only text can answer. */
  readonly sources: readonly string[];
}

/** The versions of Prisma this generator has been checked against. */
export const SUPPORTED_PRISMA_MAJOR = 7;

export function diagnose(project: Project): readonly Finding[] {
  // Every other check reads a path relative to here, so all of them would
  // report their own subject missing. One accurate finding beats six.
  if (!project.inProject) {
    return [
      {
        level: "error",
        title: "No package.json here.",
        fix: "Run `perch doctor` from the root of your application.",
      },
    ];
  }

  return [
    ...prisma(project),
    ...schema(project),
    ...ir(project),
    ...wiring(project),
    ...collisions(project),
  ];
}

function prisma(project: Project): readonly Finding[] {
  const declared =
    project.dependencies["prisma"] ?? project.dependencies["@prisma/client"];
  if (declared === undefined) {
    return [
      {
        level: "error",
        title: "Prisma is not a dependency of this project.",
        fix: "pnpm add -D prisma && pnpm add @prisma/client",
      },
    ];
  }

  const major = Number(/(\d+)\./.exec(project.prismaVersion ?? "")?.[1]);
  if (Number.isInteger(major) && major !== SUPPORTED_PRISMA_MAJOR) {
    return [
      {
        level: "error",
        title:
          `Prisma ${project.prismaVersion ?? "?"} is installed; Perch reads the ` +
          `DMMF of Prisma ${String(SUPPORTED_PRISMA_MAJOR)}.`,
        fix: `Install Prisma ${String(SUPPORTED_PRISMA_MAJOR)}, or wait for Perch to support this one.`,
      },
    ];
  }
  return [];
}

function schema(project: Project): readonly Finding[] {
  if (project.schema === undefined) {
    return [
      {
        level: "error",
        title: "No schema.prisma found.",
        fix: "Point --schema at it, or create one with `prisma init`.",
      },
    ];
  }

  const out: Finding[] = [];
  if (!/generator\s+\w+\s*\{[^}]*perch-prisma-generator/s.test(project.schema)) {
    out.push({
      level: "error",
      title: "schema.prisma declares no Perch generator.",
      fix:
        'Add:\n    generator perch {\n      provider = "perch-prisma-generator"\n' +
        "    }\n  then run `prisma generate`.",
    });
  }
  // Prisma 7 requires an explicit output, so its absence is a schema that will
  // not generate rather than one that generates somewhere surprising.
  if (!/generator\s+\w+\s*\{[^}]*prisma-client(-js)?[^}]*\}/s.test(project.schema)) {
    out.push({
      level: "warning",
      title: "schema.prisma declares no Prisma client generator.",
      fix: "Perch reads your data through the generated client; add one.",
    });
  }
  return out;
}

function ir(project: Project): readonly Finding[] {
  if (!project.irPresent) {
    return [
      {
        level: "error",
        title: "No generated IR.",
        fix: "Run `prisma generate`, or point --ir at where the generator writes.",
      },
    ];
  }
  if (project.schemaFingerprint === undefined || project.irSchemaHash === undefined) {
    return [];
  }
  if (project.schemaFingerprint !== project.irSchemaHash) {
    return [
      {
        level: "error",
        title: "The IR was generated from a different schema.",
        fix: "Run `prisma generate`. Until then the panel describes columns the database may no longer have.",
      },
    ];
  }
  return [];
}

function wiring(project: Project): readonly Finding[] {
  if (project.sources.some((source) => source.includes("PanelModule.forRoot"))) {
    return [];
  }
  return [
    {
      level: "error",
      title: "No PanelModule.forRoot in the source.",
      fix: "Import PanelModule into a Nest module and call forRoot with your resources.",
    },
  ];
}

/**
 * Two resources on one URL: whichever wins, the other is unreachable.
 *
 * Read from the decorators as text. `ResourceRegistry` refuses this at boot with
 * a precise message, so what this adds is finding it before the app runs — and
 * what it can do is miss one, never invent one. Two decorators that resolve to
 * the same slug *are* a collision.
 */
function collisions(project: Project): readonly Finding[] {
  const slugs = new Map<string, number>();
  for (const source of project.sources) {
    // Up to the closing `})`, not to the first `}`: an options object holding a
    // nested one would otherwise be cut short, and a `slug` written after it
    // would be missed — which invents a collision rather than missing one.
    for (const match of source.matchAll(/@PanelResource\(\s*\{([\s\S]*?)\}\s*\)/g)) {
      const body = match[1] ?? "";
      const explicit = /slug\s*:\s*["'`]([^"'`]+)/.exec(body)?.[1];
      if (explicit !== undefined) {
        slugs.set(explicit, (slugs.get(explicit) ?? 0) + 1);
        continue;
      }
      const model = /model\s*:\s*["'`]([^"'`]+)/.exec(body)?.[1];
      if (model === undefined) continue;
      const slug = defaultSlug(model);
      slugs.set(slug, (slugs.get(slug) ?? 0) + 1);
    }
  }

  return [...slugs.entries()]
    .filter(([, count]) => count > 1)
    .map(([slug, count]) => ({
      level: "error" as const,
      title: `${String(count)} resources answer at "${slug}".`,
      fix: "Give all but one an explicit `slug` in @PanelResource.",
    }));
}
