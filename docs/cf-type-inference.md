# Durable Object configuration type inference

Researched October 8, 2026 against `cf@1.0.0-beta.13`, its installed `@cloudflare/config@0.24.0`, and TypeScript 7.0.2.

Explicit `<undefined>` is a valid type argument, but Cloudflare's documented API does not require it for a Durable Object without a Container. The errors that prompted it here match an upstream declaration-generation bug in `@cloudflare/config@0.24.0`.

## Documented behavior

Cloudflare's configuration examples use:

```ts
exports: {
  RaceRoom: exports.durableObject({ storage: "sqlite" }),
}
```

The builder signature is:

```ts
durableObject<
  TContainer extends ContainerDefinition | undefined = undefined,
>(
  options: DurableObjectCreatedExportOptions<TContainer>,
): DurableObjectCreatedExport<TContainer>;
```

`TContainer` describes an optional Container configuration attached through the `container` property. `storage: "sqlite"` selects the Durable Object's storage backend. `<undefined>` is a TypeScript argument, removed at runtime; it does not pass an `undefined` JavaScript argument. [Cloudflare programmatic configuration reference](https://developers.cloudflare.com/cf/projects/cloudflare-config/).

## Confirmed upstream defect

[workers-sdk issue #16137](https://github.com/cloudflare/workers-sdk/issues/16137) reproduces this defect against the same `cf` and config versions, with both TypeScript 7.0.2 and 5.8.3. An exported Worker containing an ordinary Durable Object builder call infers a Container type whose union members are private interfaces. TypeScript cannot name `DurableObjectContainerConfig` and `StandardContainerConfig` in generated declarations. Its named export reproduction reports TS4023; this project's default export reports the corresponding TS4082.

[Upstream fix #16138](https://github.com/cloudflare/workers-sdk/pull/16138), merged October 8, 2026, exports those Container interfaces, along with other types referenced by public helpers. It keeps the helpers' inference signatures intact. The [package changelog](https://github.com/cloudflare/workers-sdk/blob/main/packages/config/CHANGELOG.md) places the fix in version 0.24.1, which was confirmed published on npm during this investigation.

The separate [consumer testing PR #15960](https://github.com/cloudflare/workers-sdk/pull/15960) explains why earlier tests missed the problem: source tests could access types that bundled, installed package declarations did not export through their public entry point. It adds checks against built declarations.

## Local reproduction

With the installed 0.24.0 declarations, declaration generation of a minimal `defineConfig` default export gave these results:

| Configuration                                                                                                      | Result                               |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Inline `exports.durableObject({ storage: "sqlite" })`                                                              | TS4082 for both Container interfaces |
| Inline `exports.durableObject<undefined>({ storage: "sqlite" })`                                                   | Passes                               |
| Standalone `const raceRoom = exports.durableObject({ storage: "sqlite" })`, then `exports: { RaceRoom: raceRoom }` | Passes                               |
| Configuration factory with the ordinary inline call                                                                | Same TS4082 errors                   |

The explicit and standalone variants produced byte-identical `.d.ts` files containing `DurableObjectCreatedExport<undefined>`.

An additional type probe confirmed the inline call's Container parameter was wider than `undefined`, while the standalone call inferred `undefined`. Removing the enclosing configuration's context preserves the builder's narrow result. This does not imply a runtime Container is configured.

## TypeScript context

A generic default applies when inference cannot select a candidate; an explicit type argument fixes the candidate directly. [TypeScript generic parameter defaults](https://www.typescriptlang.org/docs/handbook/2/generics.html#generic-parameter-defaults).

TypeScript can infer generic arguments from a call's contextual return type. That makes an omitted generic argument potentially different from explicitly choosing its default inside another typed expression. [TypeScript changes: return types as inference targets](https://github.com/microsoft/TypeScript/wiki/Breaking-Changes#return-types-as-inference-targets).

`composite` makes `declaration` default to `true`, explaining why declaration accessibility matters to this project's checks even though the application is not publishing a type library. [TypeScript composite configuration](https://www.typescriptlang.org/tsconfig/composite.html).

## Implication for this project

The project now consumes the upstream patch and uses the documented ordinary inline builder call. Since `cf@1.0.0-beta.13` pins 0.24.0, a targeted pnpm override maps `@cloudflare/config@0.24.0` to 0.24.1. Dependency inspection confirmed this updates the `cf` and build-output-utils paths while leaving the Vite plugin's 0.17.0 dependency intact.

Validation with 0.24.1 passed: ordinary inline minimal declaration generation, forced full project `tsc -b`, `cf-typegen`, production deployment dry run, and all 72 tests. The minimal declaration now names the Container interfaces through their public exports. The earlier `<undefined>` was a valid workaround for this package defect, but is no longer needed.
