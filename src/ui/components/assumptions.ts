/** "Model assumptions" disclosure: global MODEL_ASSUMPTIONS + run assumptions + provenance (DESIGN §24). */
import type { SimulationOutput } from '../../physics/types';
import { MODEL_ASSUMPTIONS } from '../../physics/types';
import { h, replace } from '../dom';

export function renderAssumptions(container: HTMLElement, out: SimulationOutput | null): void {
  const global = new Set(MODEL_ASSUMPTIONS);
  const run = (out?.assumptions ?? []).filter((a) => !global.has(a));
  const open = container.querySelector('details')?.open ?? false;
  const details = h('details', { class: 'card assumptions' },
    h('summary', { class: 'card__title' }, 'Model assumptions'),
    h('h3', { class: 'panel-title' }, 'Always'),
    h('ul', {}, ...MODEL_ASSUMPTIONS.map((a) => h('li', {}, a))),
    run.length ? h('h3', { class: 'panel-title' }, 'This run') : null,
    run.length ? h('ul', {}, ...run.map((a) => h('li', {}, a))) : null,
    h('h3', { class: 'panel-title' }, 'Provenance'),
    out?.provenance.length ? h('ul', {}, ...out.provenance.map((a) => h('li', {}, a))) : h('p', { class: 'hint' }, 'No run yet.'));
  details.open = open;
  replace(container, details);
}
