/** "Model assumptions & limitations" accordion: MODEL_ASSUMPTIONS + run assumptions + full provenance (DESIGN §24). */
import type { SimulationOutput } from '../../physics/types';
import { MODEL_ASSUMPTIONS } from '../../physics/types';
import { h, replace } from '../dom';
import { icon } from '../icons';

export function renderAssumptions(container: HTMLElement, out: SimulationOutput | null, defaultOpen: boolean): void {
  const global = new Set(MODEL_ASSUMPTIONS);
  const run = (out?.assumptions ?? []).filter((a) => !global.has(a));
  const prev = container.querySelector('details');
  const details = h('details', { class: 'panel accordion' },
    h('summary', { class: 'accordion__sum' }, h('span', { class: 'panel__title' }, 'Model assumptions & limitations'), icon('chevron', 18)),
    h('h3', { class: 'micro' }, 'Always'),
    h('ul', { class: 'bullets' }, ...MODEL_ASSUMPTIONS.map((a) => h('li', {}, a))),
    run.length ? h('h3', { class: 'micro' }, 'This run') : null,
    run.length ? h('ul', { class: 'bullets' }, ...run.map((a) => h('li', {}, a))) : null,
    h('h3', { class: 'micro' }, 'Provenance'),
    out?.provenance.length ? h('ul', { class: 'bullets' }, ...out.provenance.map((a) => h('li', {}, a))) : h('p', { class: 'muted' }, 'No run yet.'));
  details.open = prev ? prev.open : defaultOpen;
  replace(container, details);
}
