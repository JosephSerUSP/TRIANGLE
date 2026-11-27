# Unmerged branches: inventory (2026-11-27)

Every branch below is a single-commit experiment from 1–5 Dec 2025, written against the code from before the `refactor/ontology` rewrite. None can be merged as-is, because the files they touch (AudioSystem, Performer, Config) have been restructured. Branches that exist both locally and on `origin` are listed twice.

Regenerate this list with:
`git for-each-ref --format='%(refname:short)' refs/heads refs/remotes/origin` + `git rev-list --count main..<b>`.

**Suggested handling**
- **Audio-design experiments**: possible sources for D1 mapping modes or alternative arrangements. Read them before deleting: `hamauzu-*`, `harmonic-overhaul`, `refactor-audio-bossa`, `voice-leading-agent`, `shibuya-kei-audio-refactor`, `audio-refactor-deterministic-fuller`, `audio-refactor-persistence-and-quality`, `improve-audio-quality-persistence`, `enhance-audio-system`, `feature/audio-evolution-kick`, `update-audio-logic`, `audio-system-refactor`.
- **Superseded by this refactor** (architecture, layout, viewport, config, docs): safe to delete: `refactor-modular-architecture`, `refactor/modular-architecture*`, `feature/perf-manager-refactor`, `refactor-visualizer-structure`, `layout-fixes-and-config`, `stencil-viewports`, `feature/viewport-animation-masking`, `feature/audio-config-refactor`, `feature/simplified-bass-dynamic-kick`, `feature-audio-kick-dynamic`, `doc-update`, `add-detailed-documentation`.
- Deleted on 2026-11-27: `fix-visualizer-rendering` (its patch was already in main).

| Branch | Commits ahead | Unique patches | Last commit | Subject |
|---|---|---|---|---|
| `enhance-audio-system` | 1 | 1 | 2025-12-01 | Enhance audio evolution, mix balance, and performer responsi |
| `feature/hamauzu-audio-system` | 1 | 1 | 2025-12-01 | Implement Hamauzu-inspired chord system in AudioSystem |
| `stencil-viewports` | 1 | 1 | 2025-12-01 | Implement animated and angled viewport masks using Stencil B |
| `feature/audio-evolution-kick` | 1 | 1 | 2025-12-01 | Implement gradual audio evolution and dynamic kick drum |
| `update-audio-logic` | 1 | 1 | 2025-12-01 | Implement new ambient audio logic with Bass/Harmony conducto |
| `feature/viewport-animation-masking` | 1 | 1 | 2025-12-01 | Implement smooth viewport transitions with angled alpha mask |
| `feature-audio-kick-dynamic` | 2 | 1 | 2025-12-01 | Merge branch 'main' into feature-audio-kick-dynamic |
| `harmonic-overhaul` | 1 | 1 | 2025-12-01 | Refactor AudioSystem for Hamauzu-style harmony and timbre |
| `update-audio-system-hamauzu-trio` | 1 | 1 | 2025-12-01 | Refactor AudioSystem for Hamauzu-style trio performance with |
| `audio-system-refactor` | 1 | 1 | 2025-12-01 | Refactor AudioSystem for cinematic sound with intelligent vo |
| `refactor-audio-bossa` | 1 | 1 | 2025-12-01 | Refactor AudioSystem to implement Bossa Nova style with 2 in |
| `voice-leading-agent` | 1 | 1 | 2025-12-01 | Refactor AudioSystem to implement Voice Leading Agent |
| `refactor-modular-architecture` | 1 | 1 | 2025-12-01 | Refactor application into a modular architecture |
| `refactor/modular-architecture-1` | 1 | 1 | 2025-12-01 | Refactor application into modular Data-Performer-Output arch |
| `feature/audio-config-refactor` | 1 | 1 | 2025-12-01 | Refactor audio mixing to use central Config\n\n- Moved audio |
| `shibuya-kei-audio-refactor` | 1 | 1 | 2025-12-01 | Refactor audio system for Shibuya Kei aesthetic with 6 instr |
| `refactor/modular-architecture` | 2 | 2 | 2025-12-01 | Refactor monolithic index.html into modular architecture |
| `feature/simplified-bass-dynamic-kick` | 1 | 1 | 2025-12-01 | Simplify bass, add dynamic kick drum, and add audio mix conf |
| `doc-update` | 1 | 1 | 2025-12-01 | modified:   README.md modified:   index.html |
| `origin/feature/perf-manager-refactor` | 1 | 1 | 2025-12-02 | Refactor PerformanceManager for dynamic tracking and richer  |
| `add-detailed-documentation` | 2 | 2 | 2025-12-03 | modified:   docs/StructuralAnalysis.md |
| `origin/layout-fixes-and-config` | 1 | 1 | 2025-12-05 | Fix viewport transitions and add layout configuration |
| `improve-audio-quality-persistence` | 1 | 1 | 2025-12-05 | Refactor AudioSystem and Instruments for better persistence  |
| `origin/improve-audio-quality-persistence` | 1 | 1 | 2025-12-05 | Refactor AudioSystem and Instruments for better persistence  |
| `audio-refactor-persistence-and-quality` | 1 | 1 | 2025-12-05 | Refactor AudioSystem for persistence, determinism, and sound |
| `origin/audio-refactor-persistence-and-quality` | 1 | 1 | 2025-12-05 | Refactor AudioSystem for persistence, determinism, and sound |
| `origin/refactor-visualizer-structure` | 1 | 1 | 2025-12-05 | Refactor PerformanceVisualizer structure for better mask han |
| `refactor-visualizer-structure` | 1 | 1 | 2025-12-05 | Refactor PerformanceVisualizer structure for better mask han |
| `audio-refactor-deterministic-fuller` | 1 | 1 | 2025-12-05 | Refactor audio system for richer sound, deterministic rhythm |
| `origin/audio-refactor-deterministic-fuller` | 1 | 1 | 2025-12-05 | Refactor audio system for richer sound, deterministic rhythm |
