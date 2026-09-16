import { cpSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vitepress";
import { llmsTxt } from "./llms.js";
import { SIDEBAR } from "./sidebar.js";

/**
 * The documentation site.
 *
 * `srcDir` is the guide and only the guide. Everything else under `docs/` — the
 * PRDs, the ADRs, the architecture notes — is written for whoever is building
 * the framework, and a reader looking for how to declare a form does not need
 * to walk past a decision record about icon vocabularies to find it. The two
 * audiences are different, so the site serves one of them.
 *
 * Every TypeScript block on every page below is extracted and compiled against
 * what the packages publish, so an example that stopped being true fails the
 * build rather than the reader.
 */
export default defineConfig({
  title: "Perch",
  description:
    "An admin panel for NestJS. Declare a resource in TypeScript; never write a front end.",
  srcDir: "guide",
  cleanUrls: true,
  lastUpdated: true,

  /**
   * What the built site carries beyond its pages.
   *
   * `llms.txt` at the root, which is where the convention puts it, and a
   * markdown copy of every page beside its HTML. The second half is the one
   * people skip: the proposal asks a site to serve a clean markdown version of
   * each page at the same address with `.md` appended, and here that costs
   * nothing, because markdown is what the pages already are.
   *
   * Written at build rather than committed. A generated file in the tree is a
   * file somebody edits by hand once, and from then on the generator and the
   * page disagree.
   */
  buildEnd(site) {
    writeFileSync(
      join(site.outDir, "llms.txt"),
      llmsTxt({
        guide: site.srcDir,
        title: "Perch",
        summary:
          "An admin panel for NestJS. Declare a resource in TypeScript and " +
          "you never write a front end.",
      }),
      "utf8",
    );
    // Markdown and the directories holding it, named rather than excluded by
    // what a path happens to contain: a page called `publications.md` has the
    // word `public` in it.
    cpSync(site.srcDir, site.outDir, {
      recursive: true,
      filter: (from) => statSync(from).isDirectory() || from.endsWith(".md"),
    });
  },

  themeConfig: {
    nav: [
      { text: "Guide", link: "/" },
      {
        text: "GitHub",
        link: "https://github.com/nangui/perch",
      },
    ],

    // A copy, because VitePress takes a mutable sidebar and this one is shared
    // with the thing that builds llms.txt. Handing over the constant itself
    // would be handing over something a theme is free to write to.
    sidebar: SIDEBAR.map((section) => ({ ...section, items: [...section.items] })),

    socialLinks: [{ icon: "github", link: "https://github.com/nangui/perch" }],

    editLink: {
      pattern: "https://github.com/nangui/perch/edit/main/docs/guide/:path",
      text: "Edit this page on GitHub",
    },

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 Perch contributors",
    },
  },
});
