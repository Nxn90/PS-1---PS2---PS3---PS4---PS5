# PlayStation Recomp Hub

An Arabic/English Windows desktop companion for generation-specific PlayStation
recompilation projects. The browser preview validates the interface only; it
does not execute native conversion tools.

## Current adapter boundaries

- **PS1:** [PSXRecomp](https://github.com/RetroPortingToolKit/psxrecomp) is a
  general static-recompilation framework, but each game still needs a configured
  project. The app can select multiple CUE discs and check their referenced
  track files; it does not merge disc images or build an arbitrary game.
- **PS2:** [OpenGOAL](https://github.com/open-goal/jak-project) targets the
  Jak & Daxter series only. The app can group ISO inputs and link to the project
  instructions, but it does not run OpenGOAL or turn arbitrary PS2 ISOs into EXEs.
- **PS3:** [PS3Recomp](https://github.com/sp00nznet/ps3recomp) is tracked as an
  upstream toolkit, but is not integrated as a general-purpose converter.
- **PS5:** [AnyPS5](https://github.com/boykopovar/AnyPS5) can run its Windows
  relinker on a prepared ELF and module directory. It does not accept an
  ordinary retail PKG directly.
- **PS4:** unavailable until a supported workflow is integrated and verified.

The app checks the latest public GitHub commit for the four tracked repositories
on startup and every 15 minutes. It reports upstream changes in the UI; it does
not automatically download or execute upstream code.

Selecting multiple discs keeps them together as one input set. It does not
concatenate or modify copyrighted disc files. Actual multi-disc support depends
on the selected game's own recompilation project.

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
