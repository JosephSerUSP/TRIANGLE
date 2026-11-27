# TRIANGLE (repo folder: MOTION)

Webcam-driven audio-visual instrument, browser-only, zero build. GitHub: `JosephSerUSP/TRIANGLE`. See README.md for controls and architecture.

## Run / verify
- Run: `python tools/serve.py` (no-cache static server), open http://localhost:8000 (camera needs localhost).
- Tests: `node --test "tests/*.test.js"` (no npm installs; `package.json` exists only for `"type": "module"`). `tests/architecture.test.js` enforces the ontology boundaries below.
- No camera (agents: the in-app browser blocks webcams): open `/?replay=recordings/synthetic-duo.json`, press A (autopilot off), D twice (debug HUD). HUD shows BPM, bar, channel lifecycle and transposes.
- `tools/serve.py` disables caching; with plain `http.server`, edited ES modules can stay stale after reload.
- Manual check: camera on → slot 0 lights up; D cycles views (skeleton in mode 2); A toggles autopilot; click → sound; M cycles mapping modes (shown in the debug HUD).

## Ontology (keep these boundaries)
- `SomaticGesture` (core/Contracts.js) – one body's kinematics in canonical mirrored coords. Made only by `PoseExtractor` or `AutopilotSystem`.
- `EnsembleSlot` – identity + binding (physical/virtual) + debounced `active` + smoothed gesture. dt-based smoothing only.
- `PerformanceFrame` – the only thing Visualizer and Listener read. Plain data, no Three.js.
- `CONFIG` is deep-frozen. Runtime state (view mode, autopilot, mapping mode, camera size) lives in App / VisionSystem.
- Slot count comes from `CONFIG.slots` only.
- Humans first: extra people take over autopilot slots; autopilot plays only the slots nobody needs (PerformanceManager._assign).

## Jo's decisions
- **TRIANGLE is the canonical name** (the old "Perfume: Lattice Performer" name is retired).
- **D1 gesture→audio contract is an open experiment**: four modes (`canon`, `tempo`, `harmony`, `sculpt`; `sculpt` reuses ideas from the Dec-2025 audio branches) behind the M key. Pick a winner after playing with it, then delete the others.
- Tests: zero-dependency `node --test` on the pure modules; browser parts verified by hand.

## Next
- Play-test the mapping modes with `docs/d1-mapping-modes.md`; choose the default (`CONFIG.defaults.mappingMode`).
- Branches: inventory + suggested handling in `docs/branches.md` (2026-11-27). Deleting unmerged ones needs Jo's OK; the audio experiments there may feed D1.
- Verified 2026-11-27 in the in-app browser via replay (render, layout, HUD, keys, audio unlock, all 4 mapping modes, human takeover, URL overrides, camera-denied notice). Live webcam + actual sound quality still need Jo.
- PR: https://github.com/JosephSerUSP/TRIANGLE/pull/44 (branch `refactor/ontology`). Pushing from this machine: git's stored credential is `zerafidev` (no access); use `gh auth setup-git` or `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push`.
