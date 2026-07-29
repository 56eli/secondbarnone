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
    modalNode.querySelector('button')?.focus();
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
