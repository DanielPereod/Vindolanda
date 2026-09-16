import { PanelLeft } from "lucide-react";
import { AppSwitcher } from "./AppSwitcher";

export function SidebarToggle({
  open,
  onToggle,
  floating = false,
}: {
  open: boolean;
  onToggle: () => void;
  floating?: boolean;
}) {
  const label = open ? "Ocultar navegación" : "Mostrar navegación";
  return (
    <button
      type="button"
      className={`icon-button sidebar-toggle${floating ? " floating" : ""}`}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <PanelLeft size={20} strokeWidth={1.25} />
    </button>
  );
}

/** Cabecera compartida de las barras laterales: selector + colapsar. */
export function SidebarHeader({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="sidebar-top">
      <AppSwitcher />
      <SidebarToggle open={open} onToggle={onToggle} />
    </div>
  );
}
