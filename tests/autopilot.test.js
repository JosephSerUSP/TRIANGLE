import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutopilotSystem } from '../src/PerformanceManager/systems/AutopilotSystem.js';
import { seededRandom } from '../src/core/MathUtils.js';

test('autopilot gestures stay finite and in range over a long run', () => {
    const a = new AutopilotSystem([1, 2], seededRandom(9));
    let seen = 0, asleep = 0;
    for (let t = 0; t < 300; t += 0.25) {
        for (const g of a.update(t).values()) {
            if (!g) { asleep++; continue; }
            seen++;
            const { roll, pitch, yaw } = g.orientation;
            assert.ok(Math.abs(roll) <= Math.PI / 4 + 1e-9 && Math.abs(pitch) <= Math.PI / 9 + 1e-9 && Math.abs(yaw) <= Math.PI / 3 + 1e-9);
            assert.ok(g.depth >= -8 - 1e-9 && g.depth <= -2 + 1e-9);
            const tr = g.triangle;
            assert.ok(tr.width >= 0.3 - 1e-9 && tr.width <= 0.9 + 1e-9 && tr.height >= 0.2 - 1e-9 && tr.height <= 0.8 + 1e-9);
            tr.vertices.forEach(v => assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y)));
        }
    }
    assert.ok(seen > 0, 'autopilot never played');
    assert.ok(asleep > 0, 'autopilot never rested in 5 minutes');
});
