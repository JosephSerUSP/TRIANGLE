/**
 * Guards the ontology boundaries documented in CLAUDE.md, so they can't erode
 * silently: library-free core/state/audio, one input owner, frozen config,
 * and every relative named import resolving to a real export.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

function walk(dir) {
    return readdirSync(dir).flatMap(n => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
    });
}
const files = walk(SRC).map(p => ({ p, rel: relative(SRC, p).replace(/\\/g, '/'), src: readFileSync(p, 'utf8') }));

test('core, manager and listener never import three or tween', () => {
    const bad = files
        .filter(f => /^(core|PerformanceManager|PerformanceListener)\//.test(f.rel))
        .filter(f => /from\s+['"](three|@tweenjs\/tween\.js)['"]/.test(f.src))
        .map(f => f.rel);
    assert.deepEqual(bad, []);
});

test('only App.js listens to the keyboard', () => {
    const bad = files.filter(f => f.rel !== 'App.js' && /addEventListener\(\s*['"]keydown/.test(f.src)).map(f => f.rel);
    assert.deepEqual(bad, []);
});

test('nothing assigns into CONFIG', () => {
    const bad = files.filter(f => /\bCONFIG(\.\w+)+\s*=[^=]/.test(f.src)).map(f => f.rel);
    assert.deepEqual(bad, []);
});

test('every relative named import resolves to an export', () => {
    const missing = [];
    for (const f of files) {
        for (const m of f.src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
            const target = resolve(dirname(f.p), m[2]);
            if (!existsSync(target)) { missing.push(`${f.rel}: ${m[2]} (file)`); continue; }
            const t = readFileSync(target, 'utf8');
            for (const raw of m[1].split(',')) {
                const name = raw.trim().split(/\s+as\s+/)[0];
                if (name && !new RegExp(`export\\s+(const|function|class|let)\\s+${name}\\b`).test(t)) {
                    missing.push(`${f.rel}: ${name} from ${m[2]}`);
                }
            }
        }
    }
    assert.deepEqual(missing, []);
});

test('the guards above actually scanned the source tree', () => {
    assert.ok(files.length >= 15, `only ${files.length} files found under src/`);
});
