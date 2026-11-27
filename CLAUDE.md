# TRIANGLE (repo folder: MOTION)

Webcam-driven audio-visual instrument, browser-only, zero build. GitHub: `JosephSerUSP/TRIANGLE`. See README.md for controls and architecture.

## Run / verify
- Run: `python -m http.server 8000`, open http://localhost:8000 (camera needs localhost).
- Tests: `node --test "tests/*.test.js"` (no npm installs; `package.json` exists only for `"type": "module"`).
- Manual check: camera on → slot 0 lights up; D cycles views (skeleton in mode 2); A toggles autopilot; click → sound; M cycles mapping modes (shown in the debug HUD).

## Ontology (keep these boundaries)
- `SomaticGesture` (core/Contracts.js) – one body's kinematics in canonical mirrored coords. Made only by `PoseExtractor` or `AutopilotSystem`.
- `EnsembleSlot` – identity + binding (physical/virtual) + debounced `active` + smoothed gesture. dt-based smoothing only.
- `PerformanceFrame` – the only thing Visualizer and Listener read. Plain data, no Three.js.
- `CONFIG` is deep-frozen. Runtime state (view mode, autopilot, mapping mode, camera size) lives in App / VisionSystem.
- Slot count comes from `CONFIG.slots` only.

## Jo's decisions
- **TRIANGLE is the canonical name** (the old "Perfume: Lattice Performer" name is retired).
- **D1 gesture→audio contract is an open experiment**: three modes (`canon`, `tempo`, `harmony`) behind the M key. Pick a winner after playing with it, then delete the others.
- Tests: zero-dependency `node --test` on the pure modules; browser parts verified by hand.

## Next
- Play-test the mapping modes; choose the default (`CONFIG.defaults.mappingMode`).
- Stale remote branches on GitHub: cleanup was pending Jo's go-ahead (2026-11-27).
- Not yet verified in a real browser after the 2026-11-27 refactor (branch `refactor/ontology`).
