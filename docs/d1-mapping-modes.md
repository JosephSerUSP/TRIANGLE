# D1 listening guide: choosing the gesture→music mapping

TRIANGLE has four candidate mappings (decision D1, still open). Press **M** to cycle them. A notice shows the current mode, and the debug HUD (D twice) shows BPM, bar, each channel's lifecycle and transposes.

Quick setups (with `python tools/serve.py` running):

| Try | URL |
|---|---|
| Yourself, one mode, HUD on | `http://localhost:8000/?mode=sculpt&view=2` |
| Yourself alone, no virtual players | `http://localhost:8000/?autopilot=0&view=2` |
| No camera, two recorded bodies | `http://localhost:8000/?replay=recordings/synthetic-duo.json&autopilot=0&view=2` |
| No camera, one control at a time (height 0–10 s, tilt 10–20 s, span 20–30 s) | `http://localhost:8000/?replay=recordings/solo-sweep.json&autopilot=0&view=2&mode=sculpt` |

| Mode | What to do | What to listen for |
|---|---|---|
| `canon` | Raise and lower your hands | Only brightness and busyness change. The progression and 120 BPM never move. Most stable and most "composed". |
| `tempo` | Spread your arms wide, then bring them close | Tempo slides between 80 and 140 BPM (wide = slow). With several people it follows their average; autopilot only votes when no human is present. Does it feel like conducting, or like drift? |
| `harmony` | Raise your hands step by step | Your voice (pad, ostinato, arp) jumps up by a chord interval (+4, +7, +11…); the bass moves root → 3rd → 5th of the current chord. Does it stay consonant against the others? |
| `sculpt` | Tilt the line between your hands like a steering wheel | Ostinato and arp walk up/down the chord tones; the bass (a solo player is always the bass) swaps its root for the 3rd or 5th. Holding a pose repeats the same groove. Voices spread wider in stereo. A part starts at half density and builds over 30 s. |

When you've chosen: set `CONFIG.defaults.mappingMode` in `src/core/Config.js`, then delete the losing branches in `Arrangement.voiceControls` / `targetTempo` / `gate` and their tests. `sculpt` borrows from the Dec-2025 branches listed in `docs/branches.md`.
