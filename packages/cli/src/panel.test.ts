/**
 * What `perch panel` decides, read off the sources it was handed.
 *
 * The two decisions worth writing down are the ones it could get wrong on
 * somebody else's code: which class already holds a Prisma client, and whether
 * a root module can be edited without guessing.
 */
import { describe, expect, it } from "vitest";
import type { Source } from "./panel.js";
import {
  ADMIN_MODULE,
  findClient,
  findHolder,
  generatePanel,
  PANEL_DATA,
  register,
} from "./panel.js";

const OPTIONS = { path: "/admin", ir: "perch/ir.json" };

const source = (path: string, text: string): Source => ({ path, text });

const SERVICE = source(
  "src/prisma/prisma.service.ts",
  `import { Injectable } from "@nestjs/common";
import { PrismaClient } from "../../generated/client/index.js";

@Injectable()
export class PrismaService extends PrismaClient {}
`,
);

const MODULE = source(
  "src/prisma/prisma.module.ts",
  `@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
`,
);

describe("finding the client the application already has", () => {
  it("finds a service that extends PrismaClient", () => {
    expect(findClient([SERVICE])?.className).toBe("PrismaService");
  });

  it("refuses a class that holds a client without being one", () => {
    // The adapter reads client[model] and client.$transaction off whatever it
    // is given. A wrapper has neither, so injecting it compiles — the cast
    // hides it — and then fails at the first query.
    const held = source(
      "src/db.ts",
      `export class Database {\n  readonly client: PrismaClient;\n}`,
    );

    expect(findClient([held])).toBeUndefined();
    expect(findHolder([held])).toBe("Database");
  });

  it("names no holder when the client is injectable", () => {
    expect(findHolder([SERVICE])).toBeUndefined();
  });

  it("refuses to go by the name alone", () => {
    // A `PrismaService` wrapping something else would be injected and then fail
    // at the first query, which is worse than not finding it.
    const decoy = source(
      "src/prisma.service.ts",
      `@Injectable()\nexport class PrismaService {\n  find(): void {}\n}`,
    );

    expect(findClient([decoy])).toBeUndefined();
  });

  it("names the module that exports it, which is what makes it injectable", () => {
    const found = findClient([SERVICE, MODULE]);

    expect(found?.module?.className).toBe("PrismaModule");
    expect(found?.module?.importPath).toBe("../prisma/prisma.module.js");
  });

  it("leaves the module out when nothing exports it", () => {
    expect(findClient([SERVICE])?.module).toBeUndefined();
  });

  it("imports it by a path relative to the file that will use it", () => {
    expect(findClient([SERVICE])?.importPath).toBe("../prisma/prisma.service.js");
  });

  it("picks the same one whatever order the walk hands them over in", () => {
    // The directory walk has no order of its own. Without a rule here, one
    // project generates two different files on two runs.
    const other = source(
      "src/a-database.ts",
      `export class Database extends PrismaClient {}`,
    );

    expect(findClient([SERVICE, other])?.className).toBe("Database");
    expect(findClient([other, SERVICE])?.className).toBe("Database");
  });

  it("does not take what a previous run wrote as a candidate", () => {
    const ours = source(PANEL_DATA, `export class PanelData extends PrismaClient {}`);

    expect(findClient([ours])).toBeUndefined();
    expect(findClient([ours, SERVICE])?.className).toBe("PrismaService");
  });
});

describe("what it writes", () => {
  const [admin, data] = generatePanel(OPTIONS, findClient([SERVICE, MODULE]));

  it("puts both files under src/admin", () => {
    expect(admin?.path).toBe(ADMIN_MODULE);
    expect(data?.path).toBe(PANEL_DATA);
  });

  it("wires the panel at the path it was given", () => {
    expect(admin?.contents).toContain('path: "/admin"');
    expect(admin?.contents).toContain("dataAdapter: PanelData");
  });

  it("quotes that path rather than pasting it", () => {
    // `--path` comes off a command line. Interpolated by hand, one holding a
    // quote writes a file that does not parse.
    const [odd] = generatePanel({ ...OPTIONS, path: 'a"b' }, undefined);

    expect(odd?.contents).toContain('path: "a\\"b"');
  });

  it("imports the module the adapter injects from, so the container can build it", () => {
    // `dataAdapter` is built inside PanelModule, so what it injects has to be
    // visible there. Without this the panel fails to boot.
    expect(admin?.contents).toContain(
      'import { PrismaModule } from "../prisma/prisma.module.js"',
    );
    expect(admin?.contents).toContain("imports: [PrismaModule]");
  });

  it("honours the source root it was given", () => {
    // `--src` is a documented option; writing to a hard-coded `src/` whatever
    // it says is the kind of half-support that is worse than none.
    const [module_, adapter] = generatePanel({ ...OPTIONS, src: "app" }, undefined);

    expect(module_?.path).toBe("app/admin/admin.module.ts");
    expect(adapter?.path).toBe("app/admin/panel-data.ts");
    // And the IR is still reached from where the file actually is.
    expect(adapter?.contents).toContain('import { IR } from "../../perch/ir.js"');
  });

  it("leaves resources empty, and says where they go", () => {
    expect(admin?.contents).toContain("resources: []");
    expect(admin?.contents).toContain("perch resource User");
  });

  it("builds the adapter from the injected client and the generated IR", () => {
    expect(data?.contents).toContain(
      "export class PanelData extends PrismaDataAdapter",
    );
    expect(data?.contents).toContain("constructor(client: PrismaService)");
    expect(data?.contents).toContain("super({ client: client as never, ir: IR })");
    expect(data?.contents).toContain('import { IR } from "../../perch/ir.js"');
  });
});

describe("when the application has no client to inject", () => {
  const [admin, data] = generatePanel(OPTIONS, undefined);

  it("takes one through a token rather than guessing", () => {
    // Prisma 7 needs a driver adapter and takes its URL out of the schema, so
    // the client is the application's to build. A token makes the one line to
    // write visible.
    expect(data?.contents).toContain("PANEL_PRISMA_CLIENT");
    expect(data?.contents).toContain(
      "@Inject(PANEL_PRISMA_CLIENT) client: PrismaClientLike",
    );
  });

  it("asks forRoot to import nothing it cannot name", () => {
    // The module's own `imports` holds `PanelModule.forRoot`; what must be
    // absent is the one *inside* it, which would name a module that is not
    // there.
    expect(admin?.contents).not.toContain("undefined");
    expect(admin?.contents.match(/imports: \[/g)).toHaveLength(1);
  });
});

describe("registering it in a root module", () => {
  const APP = `import { Module } from "@nestjs/common";

@Module({
  imports: [ConfigModule],
  controllers: [AppController],
})
export class AppModule {}
`;

  it("adds the import and the entry", () => {
    const after = register(APP);

    expect(after).toContain('import { AdminModule } from "./admin/admin.module.js";');
    expect(after).toContain("imports: [AdminModule, ConfigModule]");
    // Everything else is left exactly where it was.
    expect(after).toContain("controllers: [AppController],");
  });

  it("gives a module with no imports one", () => {
    const after = register(`@Module({ controllers: [AppController] })
export class AppModule {}
`);

    expect(after).toContain("imports: [AdminModule],");
  });

  it("adds no comma to an empty list", () => {
    expect(register(`@Module({ imports: [] })\nexport class A {}`)).toContain(
      "imports: [AdminModule]",
    );
  });

  it("adds the import before the first one, never inside it", () => {
    // Prettier writes `import {\n  Module,\n} from …` all the time. Inserting
    // after the first *line* of that lands between the braces and produces a
    // file that does not parse — on somebody else's app.
    const wrapped = `import {\n  Module,\n} from "@nestjs/common";\n\n@Module({ imports: [] })\nexport class AppModule {}\n`;
    const after = register(wrapped);

    expect(after).toContain(
      'import { AdminModule } from "./admin/admin.module.js";\nimport {\n  Module,\n}',
    );
  });

  it("leaves no trailing space before a newline in a multi-line list", () => {
    // We write into somebody else's file; it comes back as they would have
    // written it, not as something their formatter has to repair.
    const after = register(
      `@Module({\n  imports: [\n    ConfigModule,\n  ],\n})\nexport class A {}`,
    );

    expect(after).toContain("imports: [AdminModule,\n    ConfigModule,");
    expect(after).not.toMatch(/[ \t]+\n/);
  });

  it("changes nothing when it is already registered", () => {
    const already = `import { AdminModule } from "./admin/admin.module.js";\n@Module({ imports: [AdminModule] })\nexport class A {}`;

    expect(register(already)).toBe(already);
  });

  it("refuses a file holding more than one @Module", () => {
    // Which of the two is the root? Guessing puts the panel inside a feature
    // module, where its routes are still mounted and nobody expected them.
    const two = `@Module({ imports: [] })
export class Services {}

@Module({ imports: [Services] })
export class AppModule {}
`;

    expect(register(two)).toBeUndefined();
  });

  it("refuses an imports that is not a plain array", () => {
    const computed = `@Module({ imports: buildImports() })\nexport class AppModule {}`;

    // It falls back to adding an `imports` — which would be a second key. The
    // decorator has one already, so this has to be left alone.
    expect(register(computed)).toBeUndefined();
  });
});
