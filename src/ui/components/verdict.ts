/**
 * Model verdict card (DESIGN §19): status in large type with an icon (never
 * color alone), aria-live; a one-line summary; every check as a compact pill
 * (icon, label, short observed / target) that expands on tap to show the full
 * values and the reason; then confidence + reasons and the disclaimer.
 */
import type { HabitabilityCheck, HabitabilityResult, HabitabilityStatus } from '../../physics/types';
import { h, renderIfChanged, replace, setText } from '../dom';
import { icon } from '../icons';

export const STATUS_BADGE: Record<HabitabilityStatus, { icon: string; cls: 'good' | 'warn' | 'bad' }> = {
  'Highly Habitable': { icon: 'check', cls: 'good' },
  'Marginally Habitable': { icon: 'help', cls: 'warn' },
  Uninhabitable: { icon: 'x', cls: 'bad' },
};

const PILL = (p: boolean | null) =>
  p === true ? { i: 'check', t: 'Pass', c: 'pass' } : p === false ? { i: 'x', t: 'Fail', c: 'fail' } : { i: 'help', t: 'Cannot evaluate', c: 'unknown' };

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** Short pill versions of a check's observed/target strings; the full text stays in the expanded part. */
export function shortVals(c: HabitabilityCheck): [string, string] {
  const noParen = (x: string) => x.replace(/\s*\(.*\)\s*$/, '');
  let obs = noParen(c.observed || 'unknown');
  let tgt = noParen(c.target);
  if (c.id === 'tidal') {
    obs = obs.replace(/^locking:\s*/, '').split(';')[0]!.trim();
    tgt = tgt.replace(/^locking\s*/, '').replace(/stellar tide\s*≤\s*/, 'tide ≤').replace(/\s*Earth['’]s\s*$/, '')
      .replace(/(\d{1,3}(?:,\d{3})+|\d+)×/, (m, n: string) => {
        const v = Number(n.replace(/,/g, ''));
        const k = Math.log10(v);
        return Number.isInteger(k) && k >= 3 ? `10${String(k).split('').map((d) => SUP[d] ?? d).join('')}×` : m;
      });
  }
  return [obs, tgt];
}

export class VerdictCard {
  readonly el: HTMLElement;
  private live: HTMLDivElement;
  private summary: HTMLParagraphElement;
  private checks: HTMLUListElement;
  private conf: HTMLDivElement;
  private disclaimer: HTMLParagraphElement;
  private lastKey = '';
  private pillIds = '';
  private pills: PillRefs[] = [];

  constructor() {
    this.live = h('div', { class: 'verdict__live', 'aria-live': 'polite', 'aria-atomic': 'true' });
    this.summary = h('p', { class: 'verdict__summary' });
    this.checks = h('ul', { class: 'pills', 'aria-label': 'Checks (tap one for details)' });
    this.conf = h('div', { class: 'verdict__conf' });
    this.disclaimer = h('p', { class: 'verdict__disclaimer' },
      'Model output, not evidence of life. These labels mean “habitable according to this simplified model”.');
    this.el = h('section', { class: 'panel verdict', id: 'verdict', 'aria-labelledby': 'verdict-h' },
      h('h2', { id: 'verdict-h', class: 'micro' }, 'Model verdict'),
      this.live, this.summary, this.checks, this.conf, this.disclaimer);
  }

  update(r: HabitabilityResult | null, summary: string): void {
    if (!r) {
      this.el.className = 'panel verdict';
      replace(this.live, h('p', { class: 'verdict__status' }, 'No result yet'));
      this.summary.textContent = 'Pick a planet or move a slider to run the model.';
      replace(this.checks); renderIfChanged(this.conf, '∅', () => replace(this.conf));
      this.lastKey = ''; this.pillIds = '';
      return;
    }
    const b = STATUS_BADGE[r.status];
    this.el.className = `panel verdict verdict--${b.cls}`;
    const key = `${r.status}|${r.confidence}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      replace(this.live, h('p', { class: 'verdict__status' }, icon(b.icon, 30), h('span', {}, r.status)));
    }
    setText(this.summary, summary);
    // Pills are rebuilt only when the set of checks changes; otherwise updated in place
    // (keeps any pill the user expanded open, and keeps slider drags cheap).
    const ids = r.checks.map((c) => c.id).join(',');
    if (ids !== this.pillIds) {
      this.pillIds = ids;
      this.pills = r.checks.map(() => this.buildPill());
      replace(this.checks, ...this.pills.map((p) => h('li', {}, p.root)));
    }
    r.checks.forEach((c, i) => this.fillPill(this.pills[i]!, c));
    renderIfChanged(this.conf, `${r.confidence}|${r.confidenceReasons.join('|')}`, () => replace(this.conf,
      h('p', { class: 'verdict__conflabel' }, `Confidence: ${r.confidence}`),
      r.confidenceReasons.length ? h('ul', {}, ...r.confidenceReasons.map((x) => h('li', {}, x))) : null));
    if (r.disclaimer) setText(this.disclaimer, r.disclaimer);
  }

  private buildPill(): PillRefs {
    const p = {
      icon: h('span', { class: 'pill__icon' }), state: h('span', { class: 'visually-hidden' }),
      label: h('span', { class: 'pill__label' }), weight: h('span', { class: 'pill__weight' }),
      obs: h('span', { class: 'pill__obs' }), target: document.createTextNode(''),
      full: h('p', { class: 'pill__full' }), reason: h('p', {}),
    } as Omit<PillRefs, 'root' | 'kind'>;
    const root = h('details', { class: 'pill' },
      h('summary', { class: 'pill__sum' },
        p.icon,
        h('span', { class: 'pill__head' }, p.state, p.label, p.weight),
        h('span', { class: 'pill__vals' }, p.obs, h('span', { class: 'pill__target' }, h('span', { class: 'visually-hidden' }, 'target '), p.target)),
        h('span', { class: 'pill__chev' }, icon('chevron', 16))),
      h('div', { class: 'pill__more' }, p.full, p.reason));
    return { ...p, root, kind: '' };
  }

  private fillPill(p: PillRefs, c: HabitabilityCheck): void {
    const k = PILL(c.passed);
    if (p.kind !== k.c) {
      p.kind = k.c;
      p.root.className = `pill pill--${k.c}`;
      replace(p.icon, icon(k.i, 18));
      setText(p.state, `${k.t}: `);
    }
    const [obs, tgt] = shortVals(c);
    setText(p.label, c.label);
    setText(p.weight, c.weight);
    setText(p.obs, obs);
    if (p.target.data !== tgt) p.target.data = tgt;
    setText(p.full, `Observed ${c.observed || 'unknown'}. Target ${c.target}.`);
    setText(p.reason, c.reason);
  }
}

interface PillRefs {
  root: HTMLDetailsElement; kind: string; icon: HTMLSpanElement; state: HTMLSpanElement; label: HTMLSpanElement;
  weight: HTMLSpanElement; obs: HTMLSpanElement; target: Text; full: HTMLParagraphElement; reason: HTMLParagraphElement;
}
