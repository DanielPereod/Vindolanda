import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CheckCheck,
  ChevronRight,
  Salad,
  Vault,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

const TASKS_APP = {
  id: "tasks",
  name: "Tareas",
  description: "Un poco más de claridad",
  to: "/today",
  match: (path: string) =>
    !path.startsWith("/notes") && !path.startsWith("/nutrition"),
  Icon: CheckCheck,
};

const NOTES_APP = {
  id: "notes",
  name: "Notas",
  description: "Conecta lo que piensas",
  to: "/notes",
  match: (path: string) => path.startsWith("/notes"),
  Icon: BookOpen,
};

const NUTRITION_APP = {
  id: "nutrition",
  name: "Nutrición",
  description: "Come con intención",
  to: "/nutrition",
  match: (path: string) => path.startsWith("/nutrition"),
  Icon: Salad,
};

const APPS = [TASKS_APP, NOTES_APP, NUTRITION_APP];

export function AppSwitcher() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = APPS.find((app) => app.match(location.pathname)) ?? TASKS_APP;

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="workspace-switcher" ref={ref}>
      <button
        className="workspace-select"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Cambiar de aplicación"
        onClick={() => setOpen((value) => !value)}
      >
        <Vault className="workspace-vault-icon" size={16} aria-hidden="true" />
        <span className="workspace-name">{active.name}</span>
        <ChevronRight
          size={14}
          className={open ? "chevron chevron-open" : "chevron"}
        />
      </button>
      {open && (
        <div className="app-menu" role="menu" aria-label="Aplicaciones">
          {APPS.map((app) => (
            <NavLink
              key={app.id}
              to={app.to}
              role="menuitem"
              className={({ isActive }) =>
                `app-menu-item${isActive || app.match(location.pathname) ? " active" : ""}`
              }
            >
              <span className="app-menu-icon" aria-hidden="true">
                <app.Icon size={17} />
              </span>
              <span>
                {app.name}
                <small>{app.description}</small>
              </span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
