/**
 * Compact bar fixed to the bottom of the viewport below 1024 px: verdict +
 * surface temperature + water phase, tinted like the verdict card. Tapping it
 * opens the Results section. Not aria-live (the verdict card already is).
 */
import type { SimulationOutput } from '../../physics/types';
import { h, replace } from '../dom';
import { kelvin, celsius, waterPhaseLabel } from '../format';
import { icon } from '../icons';
import { STATUS_BADGE } from './verdict';

export class ResultBar {
  readonly el: HTMLButtonElement;

  constructor(onOpen: () => void) {
    this.el = h('button', { type: 'button', class: 'resultbar', 'aria-label': 'Current result: open Results' });
    this.el.addEventListener('click', onOpen);
  }

  update(out: SimulationOutput | null): void {
    if (!out) { this.el.hidden = true; return; }
    this.el.hidden = false;
    const b = STATUS_BADGE[out.habitability.status];
    this.el.dataset.tone = b.cls;
    replace(this.el,
      h('span', { class: 'resultbar__status' }, icon(b.icon, 18), out.habitability.status),
      h('span', { class: 'resultbar__vals' },
        h('span', {}, `${kelvin(out.surfaceTemp.value)} (${celsius(out.surfaceTemp.value)})`),
        h('span', {}, waterPhaseLabel(out.waterPhase.value))));
  }
}
