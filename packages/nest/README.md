# @perchjs/nest

The NestJS adapter: `PanelModule`, the routes, the guards and the navigation. This is the
package an application installs.

Part of [Perch](https://github.com/nangui/perch) — an admin panel for NestJS that you declare
in TypeScript and never write a front end for. The six `@perchjs/*` packages share one version
number and are released together.

```ts
imports: [PanelModule.forRoot({ path: "/admin", resources: [PersonResource] })]
```

## Documentation

The decisions behind this package, and the reasoning for each, are in the repository:
`docs/` for the architecture and the product, `docs/adr/` for the structural choices.

## Licence

MIT
