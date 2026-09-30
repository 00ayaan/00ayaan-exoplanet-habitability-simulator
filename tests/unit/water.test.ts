// Owner: Agent 4. Unit tests for src/physics/water.ts.
import { describe, expect, it } from 'vitest';
import { waterPhase } from '../../src/physics/water';
import { WATER_TRIPLE_POINT_BAR } from '../../src/physics/constants';

describe('waterPhase at 1 bar', () => {
  it('250 K is ice', () => expect(waterPhase(250, 1).value).toBe('ice'));
  it('288 K is liquid', () => expect(waterPhase(288, 1).value).toBe('liquid'));
  it('400 K is vapor', () => expect(waterPhase(400, 1).value).toBe('vapor'));
  it('returns a categorical Result labelled approximate', () => {
    const r = waterPhase(288, 1);
    expect(r.unit).toBe('');
    expect(r.assumptions.some((a) => a.includes('APPROXIMATE'))).toBe(true);
  });
});

describe('waterPhase boundaries', () => {
  it('273.15 K and 373.15 K are liquid (inclusive)', () => {
    expect(waterPhase(273.15, 1).value).toBe('liquid');
    expect(waterPhase(373.15, 1).value).toBe('liquid');
  });
  it('just outside the boundaries', () => {
    expect(waterPhase(273.149, 1).value).toBe('ice');
    expect(waterPhase(373.151, 1).value).toBe('vapor');
  });
  it('exactly at the triple-point pressure liquid is allowed', () => {
    expect(waterPhase(288, WATER_TRIPLE_POINT_BAR).value).toBe('liquid');
  });
});

describe('waterPhase pressure rules', () => {
  it('below the triple-point pressure there is no liquid even at 300 K', () => {
    const r = waterPhase(300, 0.001);
    expect(r.value).toBe('no-liquid-below-triple-point');
    expect(r.assumptions.some((a) => a.includes('triple-point'))).toBe(true);
  });
  it('vacuum (0 bar) is no-liquid at any temperature', () => {
    expect(waterPhase(200, 0).value).toBe('no-liquid-below-triple-point');
    expect(waterPhase(500, 0).value).toBe('no-liquid-below-triple-point');
  });
  const note = (p: number) => waterPhase(300, p).assumptions.some((a) => a.includes('only valid near 1 bar'));
  it('high/low pressure adds the boiling-point note; near 1 bar does not', () => {
    expect(note(10)).toBe(true);
    expect(note(0.1)).toBe(true);
    expect(note(1)).toBe(false);
    expect(note(0.5)).toBe(false);
    expect(note(2)).toBe(false);
  });
});

describe('waterPhase invalid input', () => {
  it('throws RangeError', () => {
    expect(() => waterPhase(0, 1)).toThrow(RangeError);
    expect(() => waterPhase(-5, 1)).toThrow(RangeError);
    expect(() => waterPhase(288, -1)).toThrow(RangeError);
    expect(() => waterPhase(NaN, 1)).toThrow(RangeError);
    expect(() => waterPhase(288, Infinity)).toThrow(RangeError);
  });
});
