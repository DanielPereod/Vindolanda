import { useEffect, useState } from "react";

/** Estado colapsable de la barra lateral, compartido por Tareas y Notas. */
export function useSidebarState(storageKey = "nav-open") {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) return saved === "1";
      return window.innerWidth > 800;
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {
      // ignorar errores de almacenamiento
    }
  }, [storageKey, open]);
  return [open, setOpen] as const;
}
