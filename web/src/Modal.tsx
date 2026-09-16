import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
/** Native modal supplies focus containment, Escape and focus restoration. */
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const reference = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    reference.current?.showModal();
    reference.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);
  return (
    <dialog ref={reference} onCancel={onClose} aria-label={title}>
      <header className="modal-header">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Cerrar">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
