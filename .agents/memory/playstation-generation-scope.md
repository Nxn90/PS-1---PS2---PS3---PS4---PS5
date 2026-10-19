---
name: PlayStation generation scope
description: Which console generations should be selectable in PlayStation Recomp Hub.
---

Keep PS1, PS2, and PS3 selectable only as clearly labeled reference paths; their input checks are not conversions. PS1 needs a per-game project, PS2Recomp needs a configured ELF-to-C++ project and a native build/runtime, and PS3 needs a decrypted ELF plus game-specific native steps. Keep PS4 unavailable. PS5 is the only integrated relinking path: AnyPS5 needs a prepared ELF and module directory, not a retail PKG. Its Windows release may be downloaded only on explicit user action, checked against the SHA-256 in current GitHub release metadata, and its resulting EXE must be validated. Track the PS1, PS2, PS3, and PS5 upstream repositories for commit updates.

**Why:** The user clarified the project boundaries and identified AnyPS5's official Windows release as the only executable path to integrate first.

**How to apply:** Distinguish repository tracking and informational file checks from native execution. Keep ISO grouping separate from PS2Recomp's ELF/config inputs; never imply an output will run without game-specific assets or verification.
