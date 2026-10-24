/** Source badge: MEASURED / ASSUMED / USER (/ UNKNOWN). Text carries the meaning; color only reinforces it. */
import type { SourceTag } from '../state';
import { h } from '../dom';

const LABEL: Record<SourceTag, string> = { measured: 'measured', assumed: 'assumed', modified: 'user', unknown: 'unknown' };
const TITLE: Record<SourceTag, string> = {
  measured: 'Measured: from the NASA Exoplanet Archive or a NASA planetary fact sheet',
  assumed: 'Assumed: a model default or star-type preset, not a measurement',
  modified: 'User: you changed this value',
  unknown: 'Unknown: not in the catalog, and not guessed',
};

export function badge(t: SourceTag): HTMLSpanElement {
  return h('span', { class: `badge badge--${t}`, title: TITLE[t] }, h('span', { class: 'visually-hidden' }, 'source: '), LABEL[t]);
}

/** Update an existing badge in place (avoids churn during slider drags). */
export function setBadge(el: HTMLSpanElement, t: SourceTag): void {
  if (el.dataset.t === t) return;
  el.dataset.t = t;
  el.className = `badge badge--${t}`;
  el.title = TITLE[t];
  el.replaceChildren(h('span', { class: 'visually-hidden' }, 'source: '), LABEL[t]);
}
