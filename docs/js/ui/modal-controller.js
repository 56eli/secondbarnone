/**
 * ModalController
 * Manages appending, displaying, focusing, and dismissing modals and overlays.
 */
export class ModalController {
  constructor(doc = globalThis.document) {
    this.doc = doc;
    this.activeModal = null;
  }

  showModal(modalNode) {
    this.dismissActive();
    this.doc?.body?.append(modalNode);
    this.activeModal = modalNode;
    // Prefer the primary action (e.g. Continue) over a portrait-lead button
    // that may appear earlier in the DOM, so the modal's real exit has focus.
    (modalNode.querySelector('.btn-primary') || modalNode.querySelector('button'))?.focus();
    return modalNode;
  }

  dismissActive() {
    if (this.activeModal) {
      /** @type {any} */ (this.activeModal)._cleanup?.();
      this.activeModal.remove();
      this.activeModal = null;
    }
    const backdrop = this.doc?.querySelector('.modal-backdrop');
    if (backdrop) {
      /** @type {any} */ (backdrop)._cleanup?.();
      backdrop.remove();
    }
  }
}
