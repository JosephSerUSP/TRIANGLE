# TRIANGLE

A browser-only audio-visual instrument. A webcam (MoveNet) reads up to three bodies; each becomes a slot with its own Three.js lattice viewport and its own voice in a generative Web Audio arrangement (Shibuya-kei progression DMaj9 – Bm9 – Em9 – A13). Autopilot fills empty slots with virtual performers.

## Run

No build and no npm dependencies. Serve the folder (the camera needs `localhost` or https):

```bash
python -m http.server 8000   # then open http://localhost:8000
```

Allow the camera, then click or press any key to start the sound.

## Controls

| Key | Action |
|---|---|
| D | Cycle view: lattice → lattice + triangle → + debug HUD and skeleton |
| A | Toggle autopilot (virtual performers in slots 1–2) |
| M | Cycle the audio mapping mode (see below) |

## Body → output

- **Shoulder tilt** → yaw (view rotation, stereo pan)
- **Vertical position** → pitch
- **Distance to camera** → depth (travel through the lattice)
- **Hands + neck** form the triangle: hand angle → roll (view and divider angle), hand height → expression (filter, density)

### Audio mapping modes (experimental, press M)

| Mode | What the gesture drives |
|---|---|
| `canon` | Fixed progression at 120 BPM; hand height = expression only |
| `tempo` | `canon` + average hand span of active slots sets tempo (wide = slow, 80–140 BPM) |
| `harmony` | `tempo` + each slot's hand height transposes its voice by a chord-friendly interval |

## Test

```bash
node --test "tests/*.test.js"
```

Pure-JS unit tests (Node 18+, no installs) cover pose extraction, slot smoothing/debounce, layout, the arrangement logic and the manager's frame contract.

## Architecture

```
RawObservation ─► SomaticGesture ─► EnsembleSlot ─► PerformanceFrame ─┬─► PerformanceVisualizer (WebGL + HUD)
 (VisionSystem,    (PoseExtractor)   (smoothing,      (plain data)      └─► PerformanceListener  (Web Audio)
  AutopilotSystem)                    presence)
```

- `src/App.js` – composition root: DOM, keys, audio unlock, resize, render loop.
- `src/core/` – immutable `Config.js`, data contract `Contracts.js`, `MathUtils.js` (no Three.js).
- `src/PerformanceManager/` – vision loop (runs apart from the render loop), autopilot, pose → gesture, slot assignment and smoothing.
- `src/PerformanceVisualizer/` – lattice viewports, stencil masks, dynamic layout, HUD.
- `src/PerformanceListener/` – `Arrangement.js` (pure musical logic), `AudioSystem.js` (scheduler), `Instruments.js`.

## License

[MIT](LICENSE)
