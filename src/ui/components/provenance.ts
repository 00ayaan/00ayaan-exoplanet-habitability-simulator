/**
 * Short, always-visible provenance under the habitability panel: where the
 * star/planet came from, plus the pipeline's "Modified from …" line in real
 * mode. The full provenance list stays in the Model assumptions <details>.
 */
import type { SimulationOutput } from '../../physics/types';
import { h, replace } from '../dom';

export function renderProvenanceLine(container: HTMLElement, out: SimulationOutput | null): void {
  if (!out) { replace(container); return; }
  const { star, planet, mode } = out.input;
  const src = mode === 'real'
    ? `Measured values: ${planet.name} / ${star.name} (${planet.source})`
    : `Hypothetical planet around a preset star (${star.source})`;
  const modified = out.provenance.filter((l) => /^modified/i.test(l));
  replace(container,
    h('p', { class: 'prov__src' }, src),
    ...modified.map((l) => h('p', { class: 'prov__mod' }, h('span', { 'aria-hidden': 'true' }, '⚑ '), l)));
}
