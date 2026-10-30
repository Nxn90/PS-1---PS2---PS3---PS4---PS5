# PlayStation Recomp Hub

A Windows desktop companion for native PlayStation recompilation and porting projects.

## Run & Operate

- Browser preview: managed artifact workflow `artifacts/ps-recomp-hub: web`
- Electron development app: `pnpm --filter @workspace/ps-recomp-hub run desktop:dev`
- Windows Hub installer: `pnpm --filter @workspace/ps-recomp-hub run desktop:win`
- Typecheck: `pnpm --filter @workspace/ps-recomp-hub run typecheck`
- Production web build: `PORT=23654 BASE_PATH=/ pnpm --filter @workspace/ps-recomp-hub run build`

## Stack

- pnpm workspace, React, TypeScript, Vite
- Electron main process uses CommonJS and a context-isolated preload bridge
- The browser artifact is a UI preview; native conversion is desktop-only

## Where things live

- `artifacts/ps-recomp-hub/src/App.tsx` — generation selection, file checks, and desktop controls
- `artifacts/ps-recomp-hub/src/lib/generationCatalog.ts` — selectable and unavailable platform status
- `artifacts/ps-recomp-hub/src/lib/i18n.ts` — Arabic and English product text
- `artifacts/ps-recomp-hub/electron/main.cjs` — native file dialogs, tool downloads, and subprocess execution
- `artifacts/ps-recomp-hub/electron/preload.cjs` — the small renderer-to-Electron API

## Product status

- PS1: CUE/BIN validation only; the per-game PSXRecomp build workflow is not integrated.
- PS2: experimental input inspection only; generated C++ and the native runtime are not built by the app.
- PS3 and PS4: unavailable until complete native pipelines are integrated and verified.
- PS5: Windows AnyPS5 relinking runs for prepared ELF, module, and `app0` game files. The tool and matching Windows libraries are downloaded from the official release and verified using GitHub SHA-256 digests.

## Gotchas

- The Electron Windows installer is the Hub app, not a converted game.
- PS5 does not accept encrypted retail PKG files directly. The user supplies a clean ELF, module files, and `app0` resources including `eboot.bin`.
- A completed PS5 output is a game folder containing the EXE, `app0`, `libs`, and required runtime DLLs; it is not a standalone EXE.
- Native AnyPS5 execution is Windows-only and has not been exercised by the Replit browser preview.
