/**
 * Habitability panel (DESIGN §19). Status badge uses icon + text + color
 * (never color alone). The status line is aria-live so screen readers hear
 * changes. The disclaimer is always visible.
 */
import type { HabitabilityResult, HabitabilityStatus } from '../../physics/types';
import { h, replace } from '../dom';

export const STATUS_BADGE: Record<HabitabilityStatus, { icon: string; cls: string }> = {
  'Highly Habitable': { icon: '●', cls: 'good' },
  'Marginally Habitable': { icon: '◐', cls: 'warn' },
  Uninhabitable: { icon: '○', cls: 'bad' },
};

const CHECK_ICON = (p: boolean | null) => (p === true ? { i: '✓', t: 'Pass', c: 'pass' } : p === false ? { i: '✗', t: 'Fail', c: 'fail' } : { i: '?', t: 'Unknown', c: 'unknown' });

export class HabitabilityPanel {
  readonly el: HTMLElement;
  private live: HTMLDivElement;
  private body: HTMLDivElement;
  private disclaimer: HTMLParagraphElement;
  private lastStatus = '';

  constructor() {
    this.live = h('div', { class: 'hab__live', 'aria-live': 'polite', 'aria-atomic': 'true' });
    this.body = h('div');
    this.disclaimer = h('p', { class: 'disclaimer' },
      'Model output, not evidence of life. These labels mean “habitable according to this simplified model”.');
    this.el = h('section', { class: 'card hab', 'aria-labelledby': 'hab-h' },
      h('h2', { id: 'hab-h', class: 'card__title' }, 'Habitability (model-defined)'),
      this.live, this.body, this.disclaimer);
  }

  update(r: HabitabilityResult | null): void {
    if (!r) {
      replace(this.live, h('p', { class: 'hint' }, 'No result yet.'));
      replace(this.body);
      return;
    }
    const b = STATUS_BADGE[r.status];
    // Only re-render the live region when the announcement would change, to avoid chatter while sliding.
    const key = `${r.status}|${r.confidence}`;
    if (key !== this.lastStatus) {
      this.lastStatus = key;
      replace(this.live,
        h('p', { class: `badge badge--${b.cls}` },
          h('span', { class: 'badge__icon', 'aria-hidden': 'true' }, b.icon),
          h('span', {}, r.status)),
        h('p', { class: 'hab__conf' }, `Confidence: ${r.confidence}`));
    }
    replace(this.body,
      r.confidenceReasons.length ? h('ul', { class: 'hab__reasons' }, ...r.confidenceReasons.map((x) => h('li', {}, x))) : null,
      h('ul', { class: 'checks' }, ...r.checks.map((c) => {
        const ic = CHECK_ICON(c.passed);
        return h('li', { class: `check check--${ic.c}` },
          h('span', { class: 'check__icon', 'aria-hidden': 'true' }, ic.i),
          h('div', { class: 'check__body' },
            h('p', { class: 'check__head' },
              h('span', { class: 'visually-hidden' }, `${ic.t}: `),
              h('strong', {}, c.label),
              h('span', { class: 'check__weight' }, c.weight)),
            h('p', { class: 'check__vals' }, `Observed ${c.observed || 'unknown'} · target ${c.target}`),
            h('p', { class: 'check__reason' }, c.reason)));
      })));
    this.disclaimer.textContent = r.disclaimer || this.disclaimer.textContent;
  }
}
