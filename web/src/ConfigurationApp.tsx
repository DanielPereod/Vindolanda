import {
  BookOpen,
  CheckCheck,
  Lock,
  Salad,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useResource } from "./api";
import type { Settings } from "./types";
import { SidebarFooter, SidebarToggle } from "./SidebarToggle";
import { useSidebarState } from "./useSidebarState";
import { useAppearance } from "./useAppearance";
import { SETTINGS_SECTIONS, SettingsPage } from "./SettingsPage";
import type { SettingsSection } from "./SettingsPage";

const ICONS: Record<SettingsSection, LucideIcon> = {
  general: SlidersHorizontal,
  tasks: CheckCheck,
  notes: BookOpen,
  nutrition: Salad,
  account: Lock,
};

function toSection(path: string): SettingsSection {
  const segment = path.replace(/^\/configuration\/?/, "").replace(/\/$/, "");
  const match = SETTINGS_SECTIONS.find((section) => section.id === segment);
  return match ? match.id : "general";
}

/** Módulo global de configuración: preferencias de todos los espacios. */
export function ConfigurationApp() {
  const settings = useResource<Settings>("/settings");
  useAppearance(settings.data);
  const [navOpen, setNavOpen] = useSidebarState("configuration-nav-open");
  const location = useLocation();
  const section = toSection(location.pathname);
  return (
    <div className={`app-shell ${navOpen ? "" : "nav-collapsed"}`}>
      {navOpen && (
        <button
          aria-label="Cerrar navegación"
          className="sidebar-backdrop"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="nav-heading">CONFIGURACIÓN</div>
        <nav aria-label="Secciones de configuración">
          {SETTINGS_SECTIONS.map((item) => {
            const Icon = ICONS[item.id];
            const to =
              item.id === "general" ? "/configuration" : `/configuration/${item.id}`;
            return (
              <NavLink key={item.id} to={to} end={item.id === "general"}>
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <SidebarFooter open={navOpen} onToggle={() => setNavOpen(!navOpen)} />
        </div>
      </aside>
      <div className="main-shell">
        <div className="topbar">
          {!navOpen && (
            <SidebarToggle
              open={navOpen}
              floating
              onToggle={() => setNavOpen(true)}
            />
          )}
        </div>
        <main className="main-content">
          {settings.isPending ? (
            <p className="muted loading">Cargando preferencias…</p>
          ) : settings.isError || !settings.data ? (
            <p role="alert" className="error">
              No se pudieron cargar tus preferencias.{" "}
              <button
                onClick={() => {
                  void settings.refetch();
                }}
              >
                Reintentar
              </button>
            </p>
          ) : (
            <SettingsPage settings={settings.data} section={section} />
          )}
        </main>
      </div>
    </div>
  );
}
