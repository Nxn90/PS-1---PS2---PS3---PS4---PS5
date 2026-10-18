---
name: PlayStation generation scope
description: Which console generations should be selectable in PlayStation Recomp Hub.
---

Keep PS1 and PS5 selectable for their limited, clearly described workflows. PS2 may be selectable for OpenGOAL guidance and disc grouping, but never present it as a general converter: that project targets Jak & Daxter. Keep PS3 and PS4 unavailable until an integrated workflow is verified. Track the PS1, PS2, PS3, and PS5 upstream repositories for commit updates.

**Why:** The user requested that the four upstream projects be monitored, while the actual coverage differs by generation: PSXRecomp is configured per game, OpenGOAL is Jak-specific, PS3Recomp is not a universal converter, and AnyPS5 requires prepared inputs.

**How to apply:** Distinguish repository tracking and project guidance from native conversion support. Enable a real converter only after verifying its inputs and end-to-end workflow; never imply upstream changes are downloaded or executed automatically.
