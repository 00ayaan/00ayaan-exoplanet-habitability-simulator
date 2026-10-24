/**
 * "?" help popover. Opens on tap/click (toggle) and on hover/keyboard focus;
 * closes on Esc, outside tap or page scroll/resize (never on scrolling inside it).
 * ≥ 640 px: a popover placed on whichever side of the button has more room,
 * height-capped with internal scroll and clamped to the viewport.
 * < 640 px: a bottom sheet (max 70% of the screen, internal scroll, Close button).
 */
import { h, nextId } from '../dom';
import { icon } from '../icons';

let openOne: Help | null = null;
let openedAt = 0;
let globalsBound = false;
const isSheet = () => document.documentElement.clientWidth < 640;

function bindGlobals(): void {
  if (globalsBound) return;
  globalsBound = true;
  const closeAll = () => openOne?.close();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
  document.addEventListener('pointerdown', (e) => {
    if (openOne && !openOne.contains(e.target as Node)) closeAll();
  });
  // Page scroll closes a floating popover (it would detach from its button), but not the
  // bottom sheet, and not the scroll that tapping/focusing may itself cause right after opening.
  window.addEventListener('scroll', () => {
    if (openOne && !isSheet() && performance.now() - openedAt > 400) closeAll();
  }, { passive: true });
  window.addEventListener('resize', () => { if (openOne && !isSheet()) closeAll(); });
}

export class Help {
  readonly el: HTMLSpanElement;
  private btn: HTMLButtonElement;
  private pop: HTMLDivElement;
  private body: HTMLDivElement;
  private pinned = false;

  /** `content` may be text or a function producing nodes (re-evaluated on open). */
  constructor(private topic: string, private content: string | (() => (Node | string)[])) {
    bindGlobals();
    const id = nextId('help');
    this.btn = h('button', { type: 'button', class: 'help__btn', 'aria-label': `About ${topic}`, 'aria-expanded': 'false', 'aria-controls': id });
    this.btn.append(icon('help', 15));
    this.body = h('div', { class: 'help__body' });
    const close = h('button', { type: 'button', class: 'btn btn--outline help__close' }, 'Close');
    close.addEventListener('click', () => { this.close(); this.btn.focus(); });
    this.pop = h('div', { id, class: 'help__pop', role: 'note', 'aria-label': `About ${topic}`, hidden: true },
      h('p', { class: 'help__title' }, topic.charAt(0).toUpperCase() + topic.slice(1)), this.body, close);
    this.el = h('span', { class: 'help' }, this.btn, this.pop);
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.isOpen() && this.pinned) this.close();
      else { this.pinned = true; this.open(); }
    });
    this.btn.addEventListener('mouseenter', () => { if (!this.isOpen() && !isSheet()) this.open(); });
    this.btn.addEventListener('mouseleave', () => { if (!this.pinned && !isSheet()) this.close(); });
    this.btn.addEventListener('focus', () => { if (!this.isOpen() && !isSheet()) this.open(); });
    this.btn.addEventListener('blur', () => { if (!this.pinned && !isSheet()) this.close(); });
    this.pop.addEventListener('mouseleave', () => { if (!this.pinned && !isSheet()) this.close(); });
  }

  contains(n: Node): boolean { return this.el.contains(n); }
  private isOpen(): boolean { return !this.pop.hidden; }

  open(): void {
    if (openOne && openOne !== this) openOne.close();
    openOne = this;
    openedAt = performance.now();
    const c = this.content;
    this.body.replaceChildren(...(typeof c === 'string' ? [h('p', {}, c)] : c()));
    const sheet = isSheet();
    this.pop.classList.toggle('is-sheet', sheet);
    this.pop.style.cssText = '';
    this.body.style.maxHeight = '';
    this.pop.hidden = false;
    this.btn.setAttribute('aria-expanded', 'true');
    if (sheet) return; // CSS places the sheet at the bottom of the screen.

    const r = this.btn.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const w = Math.min(300, vw - 24);
    this.pop.style.width = `${w}px`;
    const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), vw - w - 12);
    this.pop.style.left = `${left}px`;
    this.pop.style.setProperty('--arrow', `${Math.min(w - 12, Math.max(12, r.left + r.width / 2 - left))}px`);
    const below = vh - r.bottom - 16, above = r.top - 16;
    const up = above > below;
    const maxH = Math.max(140, Math.min(360, up ? above : below));
    this.body.style.maxHeight = `${maxH - 52}px`;
    const ph = this.pop.offsetHeight;
    this.pop.style.top = `${up ? Math.max(8, r.top - ph - 8) : r.bottom + 8}px`;
    this.pop.classList.toggle('is-above', up);
  }

  close(): void {
    this.pinned = false;
    this.pop.hidden = true;
    this.btn.setAttribute('aria-expanded', 'false');
    if (openOne === this) openOne = null;
  }
}
