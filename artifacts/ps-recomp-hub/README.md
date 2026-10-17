# PlayStation Recomp Hub

An Arabic-first Windows desktop companion for generation-specific PlayStation
recompilation workflows. The browser preview validates the interface only; it
does not execute native conversion tools.

## Current adapter boundaries

- **PS1:** PSXRecomp is a game-project framework. It does not convert every disc
  image to a finished native Windows game in one click.
- **PS5:** AnyPS5 can run its Windows relinker on a prepared ELF and module
  directory. It does not accept an ordinary retail PKG directly.
- **PS2, PS3, PS4:** intentionally unavailable until a supported workflow is
  integrated and verified.

The app does not include game files, BIOS, firmware, encryption keys, or
third-party recompilers. The desktop shell asks the user to select local tools
and files. The AnyPS5 tool must be obtained or built separately from its
[upstream repository](https://github.com/boykopovar/AnyPS5); select its Windows
relinker executable in the app. A successful relink does not guarantee that a
game is fully portable or runnable without additional game-specific files.

## Run the browser preview

```sh
pnpm --filter @workspace/ps-recomp-hub run dev
```

## Run as an Electron desktop app during development

```sh
pnpm --filter @workspace/ps-recomp-hub run desktop:dev
```

## Build a Windows installer

Run this on Windows with Node.js and pnpm installed:

```sh
pnpm install
pnpm --filter @workspace/ps-recomp-hub run desktop:win
```

The installer is written to `artifacts/ps-recomp-hub/release/`. A Windows
GitHub Actions workflow is also provided and can be started manually or by
pushing a `hub-v*` tag. The installer is currently unsigned, so Windows may
show a SmartScreen warning.
