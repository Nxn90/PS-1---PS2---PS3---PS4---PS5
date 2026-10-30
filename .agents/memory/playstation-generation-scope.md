---
name: PlayStation generation scope
description: Which console generations should be selectable in PlayStation Recomp Hub.
---

This product is for native PlayStation recompilation and Windows porting, never an emulator frontend. Do not add PCSX2, RPCS3, DuckStation, or another emulator as a conversion fallback. Keep PS1 and PS5 selectable for their limited, clearly described workflows. PS2Recomp may be selectable for its experimental ELF-to-C++ workflow, but never present it as a ready ISO-to-EXE converter: it needs project configuration and a native runtime/build. Keep PS3 and PS4 unavailable until integrated workflows are verified; the user says PS4 is lower priority. Track the PS1, PS2, PS3, and PS5 upstream repositories for commit updates.

**Why:** The user explicitly clarified that the goal is native recompilation, not emulation, and corrected the PS2 source to `ran-j/PS2Recomp`, whose README describes an experimental ELF static recompiler with game-specific configuration.

**How to apply:** Distinguish repository tracking and input grouping from native conversion support. Keep ISO disc grouping separate from PS2Recomp's ELF/config inputs; never imply upstream changes are downloaded or executed automatically. If a generation has no integrated native pipeline, mark it unavailable rather than substituting an emulator.
