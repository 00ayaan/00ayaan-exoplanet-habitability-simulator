/**
 * Range slider with linear or logarithmic mapping. Internally the <input> runs
 * 0..1000 so log and linear behave the same on touch. Optional reference markers
 * (e.g. "Earth") are real buttons (tap to snap), not hover-only.
 */
import { h, nextId } from '../dom';

const STEPS = 1000;

export interface SliderConfig {
  label: string;
  scale: 'log' | 'linear';
  min: number;
  max: number;
  format: (v: number) => string;
  markers?: { value: number; label: string }[];
  /** Short note under the slider. */
  hint?: string;
  onInput: (value: number) => void;
}

export class Slider {
  readonly el: HTMLDivElement;
  private input: HTMLInputElement;
  private output: HTMLOutputElement;
  private value = NaN;

  constructor(private cfg: SliderConfig) {
    const id = nextId('slider');
    this.input = h('input', { type: 'range', id, min: 0, max: STEPS, step: 1, class: 'slider__input' });
    this.output = h('output', { for: id, class: 'slider__value' });
    this.input.addEventListener('input', () => {
      const v = this.fromPos(Number(this.input.value));
      this.value = v;
      this.show(v);
      cfg.onInput(v);
    });
    const markers = (cfg.markers ?? []).map((m) => {
      const pct = this.toPos(m.value) / STEPS;
      const btn = h('button', {
        type: 'button', class: 'slider__marker',
        style: `--p:${pct}`,
        'aria-label': `Set ${cfg.label} to ${m.label} value (${cfg.format(m.value)})`,
      }, h('span', { class: 'slider__tick', 'aria-hidden': 'true' }), m.label);
      btn.addEventListener('click', () => { this.show(m.value); this.input.value = String(this.toPos(m.value)); cfg.onInput(m.value); });
      return btn;
    });
    this.el = h('div', { class: 'slider' },
      h('div', { class: 'slider__head' }, h('label', { for: id, class: 'control-label' }, cfg.label), this.output),
      this.input,
      markers.length ? h('div', { class: 'slider__markers' }, ...markers) : null,
      h('div', { class: 'slider__range', 'aria-hidden': 'true' }, h('span', {}, cfg.format(cfg.min)), h('span', {}, cfg.format(cfg.max))),
      cfg.hint ? h('p', { class: 'hint' }, cfg.hint) : null);
  }

  private toPos(v: number): number {
    const { min, max, scale } = this.cfg;
    const c = Math.min(max, Math.max(min, v));
    const f = scale === 'log' ? Math.log(c / min) / Math.log(max / min) : (c - min) / (max - min);
    return Math.round(f * STEPS);
  }

  private fromPos(p: number): number {
    const { min, max, scale } = this.cfg;
    const f = p / STEPS;
    const v = scale === 'log' ? min * Math.pow(max / min, f) : min + f * (max - min);
    return Number(v.toPrecision(4));
  }

  private show(v: number): void {
    const text = this.cfg.format(v);
    this.output.textContent = text;
    this.input.setAttribute('aria-valuetext', text);
  }

  /** Sync from state. The true value may lie outside the slider range (real planets); it is shown as-is. */
  update(value: number): void {
    if (value === this.value) return;
    this.value = value;
    this.show(value);
    const pos = String(this.toPos(value));
    if (this.input.value !== pos) this.input.value = pos;
  }
}
