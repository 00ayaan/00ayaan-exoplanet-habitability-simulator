/**
 * Slider row: label + "?" help + source badge, an inline number box (precise
 * entry: inputmode=decimal, Enter/blur commits, Esc cancels, validated), the
 * range input (log or linear, colored fill), and tick labels at their real
 * positions that snap the value when tapped.
 */
import { h, nextId } from '../dom';
import type { SourceTag } from '../state';
import { badge, setBadge } from './badge';
import { Help } from './help';


export interface SliderConfig {
  label: string;
  unit: string;
  scale: 'log' | 'linear';
  min: number;
  max: number;
  /** Range positions (default 1000). Chosen so one arrow-key press changes the displayed value by one display unit. */
  steps?: number;
  /** Displayed number for a value (e.g. greenhouse 0.78 → 78). Default identity. */
  toDisplay?: (v: number) => number;
  fromDisplay?: (d: number) => number;
  /** Format a display number for the box. */
  format: (d: number) => string;
  quantize?: (v: number) => number;
  ticks?: { value: number; label: string }[];
  fill?: 'sky' | 'amber' | 'slate';
  help: string;
  /** 'box' = editable number field; 'readout' = mono text only. */
  entry?: 'box' | 'readout';
  /** Muted text after the unit (e.g. "ε=0.78"). */
  extra?: (v: number) => string;
  onInput: (value: number) => void;
}

export class Slider {
  readonly el: HTMLDivElement;
  private range: HTMLInputElement;
  private box: HTMLInputElement | null = null;
  private readout: HTMLOutputElement | null = null;
  private extraEl: HTMLSpanElement;
  private err: HTMLParagraphElement;
  private badgeEl: HTMLSpanElement;
  private value = NaN;
  private disabled = false;
  private toD: (v: number) => number;
  private steps: number;
  private fromD: (d: number) => number;

  constructor(private cfg: SliderConfig) {
    this.steps = cfg.steps ?? 1000;
    this.toD = cfg.toDisplay ?? ((v) => v);
    this.fromD = cfg.fromDisplay ?? ((d) => d);
    const id = nextId('slider');
    const errId = `${id}-err`;
    this.range = h('input', { type: 'range', id, min: 0, max: this.steps, step: 1, class: `range range--${cfg.fill ?? 'sky'}` });
    this.range.addEventListener('input', () => {
      let v = this.fromPos(Number(this.range.value));
      if (cfg.quantize) v = cfg.quantize(v);
      this.set(v, false);
      cfg.onInput(v);
    });

    let valueEl: HTMLElement;
    if ((cfg.entry ?? 'box') === 'box') {
      const box = h('input', {
        type: 'text', inputmode: 'decimal', class: 'numbox', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done',
        'aria-label': `${cfg.label}${cfg.unit ? ` in ${cfg.unit}` : ''}`, 'aria-describedby': errId,
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); if (this.commit(box.value)) box.blur(); }
        else if (e.key === 'Escape') { this.cancel(); box.blur(); }
      });
      box.addEventListener('blur', () => { if (!this.commit(box.value)) this.cancel(); });
      box.addEventListener('focus', () => box.select());
      this.box = box;
      valueEl = box;
    } else {
      this.readout = h('output', { for: id, class: 'readout-val' });
      valueEl = this.readout;
    }
    this.extraEl = h('span', { class: 'slider__extra' });
    this.err = h('p', { id: errId, class: 'slider__err', 'aria-live': 'polite' });
    this.badgeEl = badge('assumed');

    const ticks = (cfg.ticks ?? []).map((t) => {
      const pct = this.toPos(t.value) / this.steps;
      const edge = pct < 0.08 ? 'start' : pct > 0.92 ? 'end' : 'mid';
      const b = h('button', { type: 'button', class: `tick tick--${edge}`, style: `--p:${pct}`, 'aria-label': `Set ${cfg.label} to ${t.label}`, 'data-p': pct, 'data-edge': edge }, h('span', {}, t.label));
      b.addEventListener('click', () => {
        if (this.disabled) return;
        this.set(t.value, true);
        cfg.onInput(t.value);
      });
      return b;
    });

    this.el = h('div', { class: 'slider' },
      h('div', { class: 'slider__head' },
        h('label', { for: id, class: 'slider__label' }, cfg.label),
        new Help(cfg.label, cfg.help).el,
        this.badgeEl,
        h('span', { class: 'slider__value' }, valueEl, cfg.unit ? h('span', { class: 'slider__unit' }, cfg.unit) : null, this.extraEl)),
      this.range,
      ticks.length ? this.tickRow(ticks) : null,
      this.err);
  }

  /**
   * Tick buttons are ≥ 44 px wide. On narrow screens neighbours could overlap, so after
   * layout (and on resize only — never per slider step) they are packed left-to-right
   * without overlap, each staying as close to its true position as the row allows.
   */
  private tickRow(ticks: HTMLButtonElement[]): HTMLDivElement {
    const row = h('div', { class: 'ticks' }, ...ticks);
    const SLACK = 9; // the row is inset by the thumb radius; labels may use that margin
    const pack = () => {
      const W = row.clientWidth;
      if (!W) return;
      const items = ticks.map((b) => {
        const w = Math.max(44, (b.firstElementChild as HTMLElement).offsetWidth);
        const x = Number(b.dataset.p) * W, edge = b.dataset.edge;
        const left = edge === 'start' ? x - SLACK : edge === 'end' ? x + SLACK - w : x - w / 2;
        return { b, w, left };
      });
      let min = -SLACK;
      for (const it of items) { it.left = Math.max(it.left, min); min = it.left + it.w; }
      let max = W + SLACK;
      for (let i = items.length - 1; i >= 0; i--) { const it = items[i]!; it.left = Math.min(it.left, max - it.w); max = it.left; }
      for (const it of items) { it.b.style.left = `${it.left.toFixed(1)}px`; it.b.style.width = `${it.w}px`; it.b.classList.add('is-packed'); }
    };
    if (typeof ResizeObserver === 'function') new ResizeObserver(pack).observe(row);
    return row;
  }

  private toPos(v: number): number {
    const { min, max, scale } = this.cfg;
    const c = Math.min(max, Math.max(min, v));
    const f = scale === 'log' ? Math.log(c / min) / Math.log(max / min) : (c - min) / (max - min);
    return Math.round(f * this.steps);
  }

  private fromPos(p: number): number {
    const { min, max, scale } = this.cfg;
    const f = p / this.steps;
    const v = scale === 'log' ? min * Math.pow(max / min, f) : min + f * (max - min);
    return Number(v.toPrecision(scale === 'log' ? 4 : 6));
  }

  private commit(text: string): boolean {
    const d = Number(text.trim().replace(',', '.'));
    const { min, max } = this.cfg;
    const lo = this.toD(min), hi = this.toD(max);
    if (text.trim() === '' || !Number.isFinite(d) || d < Math.min(lo, hi) || d > Math.max(lo, hi)) {
      this.box?.setAttribute('aria-invalid', 'true');
      this.err.textContent = `Enter a number from ${this.cfg.format(lo)} to ${this.cfg.format(hi)}${this.cfg.unit ? ' ' + this.cfg.unit : ''}.`;
      return false;
    }
    let v = Number(this.fromD(d).toPrecision(6));
    if (this.cfg.quantize) v = this.cfg.quantize(v);
    this.box?.removeAttribute('aria-invalid');
    this.err.textContent = '';
    if (v !== this.value) { this.set(v, true); this.cfg.onInput(v); } else this.show(v);
    return true;
  }

  private cancel(): void {
    this.box?.removeAttribute('aria-invalid');
    this.err.textContent = '';
    if (this.box) this.box.value = Number.isFinite(this.value) ? this.cfg.format(this.toD(this.value)) : 'unknown';
    this.show(this.value);
  }

  private show(v: number): void {
    if (!Number.isFinite(v)) {
      if (this.box) this.box.value = 'unknown';
      if (this.readout) this.readout.textContent = 'unknown';
      this.range.setAttribute('aria-valuetext', 'unknown');
      this.extraEl.textContent = '';
      return;
    }
    const text = this.cfg.format(this.toD(v));
    if (this.box && document.activeElement !== this.box) this.box.value = text;
    if (this.readout) this.readout.textContent = text;
    this.range.setAttribute('aria-valuetext', `${text}${this.cfg.unit ? ' ' + this.cfg.unit : ''}`);
    this.extraEl.textContent = this.cfg.extra ? this.cfg.extra(v) : '';
  }

  private set(v: number, moveThumb: boolean): void {
    this.value = v;
    this.show(v);
    const pos = this.toPos(v);
    if (moveThumb && this.range.value !== String(pos)) this.range.value = String(pos);
    this.el.classList.remove('slider--unknown');
    this.range.style.setProperty('--pct', `${(Number(this.range.value) / this.steps) * 100}%`);
  }

  /** Sync from state. Values outside the slider range (real planets) are shown as-is; null = unknown. */
  update(value: number | null, tag: SourceTag, disabled = false): void {
    setBadge(this.badgeEl, tag);
    if (disabled !== this.disabled) {
      this.disabled = disabled;
      this.range.disabled = disabled;
      if (this.box) this.box.disabled = disabled;
      this.el.classList.toggle('is-disabled', disabled);
    }
    const v = value ?? NaN;
    if (v === this.value || (Number.isNaN(v) && Number.isNaN(this.value) && this.box?.value === 'unknown')) return;
    if (Number.isNaN(v)) {
      // Unknown: no thumb, empty track, "unknown" in the box.
      this.value = NaN;
      this.show(NaN);
      this.range.value = '0';
      this.range.style.setProperty('--pct', '0%');
      this.el.classList.add('slider--unknown');
      return;
    }
    this.set(v, true);
  }
}
