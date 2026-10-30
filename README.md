# PS CrossRecomp Hub

PS CrossRecomp Hub is a Windows desktop companion for genuine PlayStation-to-Windows recompilation projects. It does not use or launch emulators.

## Current support

| Platform | Status in this app |
| --- | --- |
| PS1 | Checks CUE/BIN disc input. PSXRecomp can recompile supported titles, but its per-game project and build workflow is not integrated here yet. |
| PS2 | Experimental input inspection only. PS2Recomp needs a game ELF, game-specific configuration, often a Ghidra map, and a native runtime build; this app does not produce its EXE yet. |
| PS3 | Unavailable until its decrypted-ELF recompilation and Windows build workflow is integrated and verified. |
| PS4 | No integrated native recompilation tool. |
| PS5 | Windows AnyPS5 relinking is integrated for prepared, clean ELF files with game modules and `app0` resources. The app can download the matching official relinker and Windows system libraries from GitHub and verify their SHA-256 digests. |

PS5 retail/encrypted PKG files are not direct inputs. The user must supply a legally prepared ELF, its module folders, and an `app0` resource folder containing the original `eboot.bin`. AnyPS5 compatibility varies by title; an EXE is not proof that a game is fully playable.

## Important: the two EXE files

`pnpm --filter @workspace/ps-recomp-hub run desktop:win` creates a Windows installer for the **Hub app**. That installer is not a converted PlayStation game.

The PS5 conversion action creates a game folder containing the Windows `.exe`, AnyPS5 system libraries, required Windows runtime DLLs, and the game’s `app0` resources. It is not a standalone EXE. The output is accepted only if the relinker exits successfully and the output has a valid Windows PE signature.

## Run and build

- Replit browser preview: `pnpm --filter @workspace/ps-recomp-hub run dev`
- Electron development app: `pnpm --filter @workspace/ps-recomp-hub run desktop:dev`
- Windows Hub installer: `pnpm --filter @workspace/ps-recomp-hub run desktop:win`
- Typecheck: `pnpm --filter @workspace/ps-recomp-hub run typecheck`
- Production web preview build: `PORT=23654 BASE_PATH=/ pnpm --filter @workspace/ps-recomp-hub run build`

Native PS5 relinking runs only in the packaged Windows app. The browser preview does not run native tools.

## Upstream projects

- [PSXRecomp](https://github.com/RetroPortingToolKit/psxrecomp)
- [PS2Recomp](https://github.com/ran-j/PS2Recomp)
- [PS3Recomp](https://github.com/sp00nznet/ps3recomp)
- [AnyPS5](https://github.com/boykopovar/AnyPS5)

The Hub does not distribute games, firmware, decryption keys, or proprietary system files. Use only game files you are legally entitled to use.
