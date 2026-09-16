import {
  Apple,
  CalendarDays,
  ChefHat,
  Settings as SettingsIcon,
  ShoppingCart,
  Target,
  TrendingUp,
  Utensils,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useResource } from "./api";
import type { Settings } from "./types";
import { SidebarFooter, SidebarToggle } from "./SidebarToggle";
import { useSidebarState } from "./useSidebarState";
import { useAppearance } from "./useAppearance";
import { DiaryPage } from "./DiaryPage";
import { FoodsPage } from "./FoodsPage";
import { PlanPage } from "./PlanPage";
import { ProfilePage } from "./ProfilePage";
import { ProgressPage } from "./ProgressPage";
import { RecipesPage } from "./RecipesPage";
import { ShoppingPage } from "./ShoppingPage";

/** Espacio de nutrición: diario, catálogo, recetas y planes. */
export function NutritionApp() {
  const settings = useResource<Settings>("/settings");
  useAppearance(settings.data);
  const [navOpen, setNavOpen] = useSidebarState("nutrition-nav-open");
  const location = useLocation();
  const path = location.pathname;
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
        <div className="nav-heading">NUTRICIÓN</div>
        <nav aria-label="Navegación de nutrición">
          <NavLink to="/nutrition" end>
            <Utensils size={18} />
            Diario
          </NavLink>
          <NavLink to="/nutrition/foods">
            <Apple size={18} />
            Alimentos
          </NavLink>
          <NavLink to="/nutrition/recipes">
            <ChefHat size={18} />
            Recetas
          </NavLink>
          <NavLink to="/nutrition/plan">
            <CalendarDays size={18} />
            Plan semanal
          </NavLink>
          <NavLink to="/nutrition/shopping">
            <ShoppingCart size={18} />
            Lista de la compra
          </NavLink>
          <NavLink to="/nutrition/progress">
            <TrendingUp size={18} />
            Progreso
          </NavLink>
          <NavLink to="/nutrition/profile">
            <Target size={18} />
            Perfil y objetivos
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <nav>
            <NavLink to="/configuration">
              <SettingsIcon size={17} />
              Configuración
            </NavLink>
          </nav>
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
          {path.startsWith("/nutrition/foods") ? (
            <FoodsPage />
          ) : path.startsWith("/nutrition/recipes") ? (
            <RecipesPage />
          ) : path.startsWith("/nutrition/plan") ? (
            <PlanPage />
          ) : path.startsWith("/nutrition/shopping") ? (
            <ShoppingPage />
          ) : path.startsWith("/nutrition/progress") ? (
            <ProgressPage />
          ) : path.startsWith("/nutrition/profile") ? (
            <ProfilePage />
          ) : (
            <DiaryPage />
          )}
        </main>
      </div>
    </div>
  );
}
