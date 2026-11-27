# TRIANGLE (repo folder: MOTION)

Webcam-driven audio-visual instrument, browser-only, zero build. GitHub: `JosephSerUSP/TRIANGLE`. See README.md for controls and architecture.

## Run / verify
- Run: `python tools/serve.py` (no-cache static server), open http://localhost:8000 (camera needs localhost).
- Tests: `node --test "tests/*.test.js"` (no npm installs; `package.json` exists only for `"type": "module"`). `tests/architecture.test.js` enforces the ontology boundaries below.
- No camera (agents: the in-app browser blocks webcams): open `/?replay=recordings/synthetic-duo.json`, press A (autopilot off), D twice (debug HUD). HUD shows FPS, BPM, bar, channel lifecycle, chord-tone lift and walk.
- `tools/serve.py` disables caching; with plain `http.server`, edited ES modules can stay stale after reload.
- Manual check: camera on → slot 0 lights up; D cycles views (skeleton in mode 2); A toggles autopilot; click → sound; M cycles mapping modes (shown in the debug HUD).

## Ontology (keep these boundaries)
- `SomaticGesture` (core/Contracts.js) – one body's kinematics in canonical mirrored coords. Made only by `PoseExtractor` or `AutopilotSystem`.
- `EnsembleSlot` – identity + binding (physical/virtual) + debounced `active` + smoothed gesture. dt-based smoothing only.
- `PerformanceFrame` – the only thing Visualizer and Listener read. Plain data, no Three.js.
- `CONFIG` is deep-frozen. Runtime state (view mode, autopilot, mapping mode, camera size) lives in App / VisionSystem.
- Slot count comes from `CONFIG.slots` only.
- Humans first: extra people take over autopilot slots; autopilot plays only the slots nobody needs (PerformanceManager._assign).

## Gotchas (learned 2026-11-27)
- MoveNet `left_*` = the person's left, imaged at **higher** pixel x by a front camera. Synthetic poses (tests/helpers.js, tools/make-synthetic-recording.js) must follow this, or level hands read as roll = ±π.
- A solo human always lands in slot 0 = **bass**. Any gesture→music idea must reach the bass voice, or a solo player won't hear it (the `sculpt` walk had this bug).
- `node --test` with a glob needs Node 21+ (CI uses 22).
- Python on Windows writes CRLF by default; repo is LF (`.gitattributes`). Use `newline='\n'` in scripted edits. Shell heredocs also eat backslashes (`\\b` → `\b`), so write regex-bearing code with the Write/Edit tools, and gate commits on the test exit code, not on grep output.

## Jo's decisions
- **TRIANGLE is the canonical name** (the old "Perfume: Lattice Performer" name is retired).
- **D1 gesture→audio contract is an open experiment**: four modes (`canon`, `tempo`, `harmony`, `sculpt`; `sculpt` reuses ideas from the Dec-2025 audio branches) behind the M key. Pick a winner after playing with it, then delete the others.
- Tests: zero-dependency `node --test` on the pure modules; browser parts verified by hand.

## Next
1. **Jo:** play-test with a webcam and sound using `docs/d1-mapping-modes.md`, then choose the D1 default (`CONFIG.defaults.mappingMode`) and retire the other modes.
2. **Jo:** review/merge https://github.com/JosephSerUSP/TRIANGLE/pull/44 (branch `refactor/ontology`, CI green, 51 tests).
3. **Jo:** decide on unmerged branches (`docs/branches.md`): the "superseded" group is safe to delete; the audio group was mined for `sculpt`.
4. Optional: register TRIANGLE in the Notion Agent Hub (not done; it is an outward change).

## Status (2026-11-27)
- Verified in the in-app browser via replay: render, layout, HUD, keys, audio unlock, all 4 mapping modes, human takeover, URL overrides, camera/replay error notices. Not verified: a live webcam, and how it actually sounds.
- Pushing from this machine: git's stored credential is `zerafidev` (no access). Use `gh auth setup-git`, or `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push`.
