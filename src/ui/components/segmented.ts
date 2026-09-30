/**
 * Segmented control / wrapping chip group built on native radio inputs
 * (keyboard + screen-reader support for free). Used for the mode switch and star type.
 */
import { h, nextId } from '../dom';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Optional secondary line (e.g. "red dwarf"). */
  sub?: string;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentOption<T>[];
}

export class Segmented<T extends string> {
  readonly el: HTMLFieldSetElement;
  private inputs = new Map<T, HTMLInputElement>();
  private labels = new Map<T, HTMLLabelElement>();

  constructor(legend: string, variant: 'segments' | 'chips', options: SegmentOption<T>[], onChange: (v: T) => void) {
    const name = nextId('seg');
    this.el = h('fieldset', { class: `segmented segmented--${variant}` }, h('legend', { class: variant === 'segments' ? 'visually-hidden' : 'control-label' }, legend));
    const row = h('div', { class: 'segmented__row' });
    for (const opt of options) {
      const input = h('input', { type: 'radio', name, value: opt.value, class: 'visually-hidden' });
      input.addEventListener('change', () => input.checked && onChange(opt.value));
      const label = h('label', { class: 'segmented__opt' }, input,
        h('span', { class: 'segmented__main' }, opt.label),
        opt.sub ? h('span', { class: 'segmented__sub' }, opt.sub) : null);
      this.inputs.set(opt.value, input);
      this.labels.set(opt.value, label);
      row.append(label);
    }
    this.el.append(row);
  }

  update(props: SegmentedProps<T>): void {
    for (const opt of props.options) {
      const input = this.inputs.get(opt.value);
      const label = this.labels.get(opt.value);
      if (!input || !label) continue;
      input.checked = opt.value === props.value;
      input.disabled = !!opt.disabled;
      label.classList.toggle('is-disabled', !!opt.disabled);
      const main = label.querySelector('.segmented__main');
      if (main && main.textContent !== opt.label) main.textContent = opt.label;
    }
  }
}
