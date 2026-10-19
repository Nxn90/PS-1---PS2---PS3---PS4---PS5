# PlayStation Recomp Hub

An Arabic/English Windows desktop companion for generation-specific PlayStation
recompilation projects. The browser preview validates the interface only; it
does not execute native conversion tools.

## Current adapter boundaries

- **PS1:** [PSXRecomp](https://github.com/RetroPortingToolKit/psxrecomp) is a
  general static-recompilation framework, but each game still needs a configured
  project. The app can select multiple CUE discs and check their referenced
  track files; it does not merge disc images or build an arbitrary game.
- **PS2:** [PS2Recomp](https://github.com/ran-j/PS2Recomp) is an experimental
  static recompiler that translates a PS2 ELF into C++. Its workflow uses a
  game-specific TOML configuration (and recommends a Ghidra-exported function
  map for retail/stripped games), then requires building and linking against its
  runtime. The app can select the ELF/configuration and group ISO images, but
  does not run the recompiler or turn ISO images directly into EXEs.
- **PS3:** [PS3Recomp](https://github.com/sp00nznet/ps3recomp) is tracked as an
  upstream toolkit, but is not integrated as a general-purpose converter.
- **PS5:** The Windows desktop app can download the latest stable
  [AnyPS5](https://github.com/boykopovar/AnyPS5) release after the user requests
  it. It checks the release ZIP's size and SHA-256 against GitHub's release
  metadata before extracting the relinker, then checks the relinker executable's
  Windows x64 PE structure and digest. A prepared ELF and module directory are
  still required; an ordinary retail PKG is not a direct input.
- **PS4:** unavailable until a supported workflow is integrated and verified.

The app checks the latest public GitHub commit for the four tracked repositories
on startup and every 15 minutes. It reports upstream changes in the UI; those
checks do not automatically download or execute upstream code. The separate
AnyPS5 installer only runs when the user presses its download button.

Selecting multiple PS1 CUEs or PS2 ISOs keeps them together as one input set. It
does not concatenate or modify disc files. For PS2, the images are not direct
PS2Recomp inputs; the tool starts from an ELF and project configuration. Actual
multi-disc game support depends on that game's own recompilation project.

The app does not include game files, BIOS, firmware, encryption keys, or
third-party recompilers. Downloaded AnyPS5 files are stored under the app's
local user-data directory. The SHA-256 is read from GitHub's release API over
HTTPS; it detects asset mismatch but is not a separate publisher signature.
The app also permits selecting an existing Windows x64 relinker executable.
After a successful relink, the app requires a non-empty Windows x64 PE output
and displays its SHA-256. This does not guarantee that a game is fully portable
or runnable without additional game-specific files.

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
