import { describe, it, expect } from 'vitest';
import { PerformerState } from '../src/core/PerformerState.js';
import * as THREE from 'three';

describe('PerformerState', () => {
    it('should initialize with correct default values', () => {
        const state = new PerformerState(0xffffff, true);
        expect(state.isBass).toBe(true);
        expect(state.hasPerformer).toBe(false);
        expect(state.color).toBeInstanceOf(THREE.Color);
    });

    it('should update physics correctly', () => {
        const state = new PerformerState(0xffffff);
        state.target.roll = 10;
        state.updatePhysics();
        expect(state.current.roll).not.toBe(0);
        expect(state.current.roll).not.toBe(10); // Should be interpolated
    });
});
