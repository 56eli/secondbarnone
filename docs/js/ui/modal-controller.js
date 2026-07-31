/**
 * Shared modal behavior for result/story dialogs and portrait lightboxes.
 *
 * Every modal receives the same focus containment, background inertness,
 * scroll lock, Escape policy and focus restoration. Keeping this in one place
 * prevents a new dialog from silently omitting an accessibility requirement.
 */

/** @type {WeakMap<Document, object[]>} */
const modalStacks = new WeakMap();

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Activate behavior for a modal node already appended directly to `<body>`.
 * @param {Document} doc
 * @param {HTMLElement} modalNode
 * @param {{initialFocusSelector?: string, onEscape?: (() => void) | null}} options
 * @returns {() => void} cleanup
 */
export function activateModal(
  doc,
  modalNode,
  { initialFocusSelector = '.btn-primary', onEscape = null } = {},
) {
  const body = doc?.body;
  if (!body || !modalNode) return () => {};

  const previousFocus = doc.activeElement;
  const previousOverflow = body.style.overflow;
  const ViewHTMLElement = doc.defaultView?.HTMLElement;
  const background = [...body.children]
    .filter((node) => node !== modalNode)
    .map((node) => ({
      node,
      inert: node.hasAttribute('inert'),
      ariaHidden: node.getAttribute('aria-hidden'),
    }));

  for (const entry of background) {
    entry.node.setAttribute('inert', '');
    entry.node.setAttribute('aria-hidden', 'true');
  }
  body.style.overflow = 'hidden';

  const dialog = modalNode.matches('[role="dialog"]')
    ? modalNode
    : modalNode.querySelector('[role="dialog"]') || modalNode;
  if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');

  const stack = modalStacks.get(doc) ?? [];
  const session = { modalNode };
  stack.push(session);
  modalStacks.set(doc, stack);

  /** @param {Element | null | undefined} element */
  const focusElement = (element) => {
    if (ViewHTMLElement && element instanceof ViewHTMLElement) element.focus();
  };
  const focusables = () => [...dialog.querySelectorAll(focusableSelector)];
  const focusInitial = () => {
    const preferred = dialog.querySelector(initialFocusSelector);
    focusElement(preferred || focusables()[0] || dialog);
  };

  const onKey = (event) => {
    if (stack.at(-1) !== session) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onEscape?.();
      return;
    }
    if (event.key !== 'Tab') return;

    const controls = focusables();
    if (controls.length === 0) {
      event.preventDefault();
      focusElement(dialog);
      return;
    }

    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = doc.activeElement;
    if (!dialog.contains(active)) {
      event.preventDefault();
      focusElement(event.shiftKey ? last : first);
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      focusElement(last);
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      focusElement(first);
    }
  };

  doc.addEventListener('keydown', onKey);
  focusInitial();

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    doc.removeEventListener('keydown', onKey);
    const index = stack.indexOf(session);
    if (index >= 0) stack.splice(index, 1);
    if (stack.length === 0) modalStacks.delete(doc);

    for (const entry of background) {
      if (!entry.inert) entry.node.removeAttribute('inert');
      if (entry.ariaHidden === null) entry.node.removeAttribute('aria-hidden');
      else entry.node.setAttribute('aria-hidden', entry.ariaHidden);
    }
    body.style.overflow = previousOverflow;
    if (ViewHTMLElement && previousFocus instanceof ViewHTMLElement && previousFocus.isConnected) {
      previousFocus.focus();
    }
  };
}

export class ModalController {
  constructor(doc = globalThis.document) {
    this.doc = doc;
    this.activeModal = null;
    this._deactivate = null;
  }

  showModal(modalNode) {
    this.dismissActive();
    this.doc?.body?.append(modalNode);
    this.activeModal = modalNode;
    this._deactivate = activateModal(this.doc, modalNode);
    return modalNode;
  }

  dismissActive() {
    if (!this.activeModal) return;
    const modal = this.activeModal;
    const deactivate = this._deactivate;
    this.activeModal = null;
    this._deactivate = null;
    /** @type {any} */ (modal)._cleanup?.();
    modal.remove();
    deactivate?.();
  }
}
