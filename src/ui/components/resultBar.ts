/**
 * Compact sticky bar at the bottom of the viewport on phones (< 900 px):
 * status badge + surface temperature + water phase, so the result stays
 * visible while dragging sliders. Hidden on wide screens via CSS. Tapping it
 * scrolls to the full habitability panel. Not aria-live (the panel already is).
 */
import type { SimulationOutput } from '../../physics/types';
import { h, replace } from '../dom';
import { kelvin, celsius, waterPhaseLabel } from '../format';
import { STATUS_BADGE } from './habitability';

export class ResultBar {
  readonly el: HTMLButtonElement;

  constructor(target: () => HTMLElement) {
    this.el = h('button', { type: 'button', class: 'resultbar', 'aria-label': 'Current result — show habitability details' });
    this.el.addEventListener('click', () => target().scrollIntoView({ block: 'start' }));
  }

  update(out: SimulationOutput | null): void {
    if (!out) { this.el.hidden = true; return; }
    this.el.hidden = false;
    const r = out.habitability;
    const b = STATUS_BADGE[r.status];
    replace(this.el,
      h('span', { class: `resultbar__status badge--${b.cls}` },
        h('span', { 'aria-hidden': 'true' }, b.icon), ` ${r.status}`),
      h('span', { class: 'resultbar__vals' },
        `${kelvin(out.surfaceTemp.value)} (${celsius(out.surfaceTemp.value)}) · ${waterPhaseLabel(out.waterPhase.value)}`));
  }
}
