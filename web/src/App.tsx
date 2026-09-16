import { useAppearance } from "./useAppearance";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NavLink, useLocation } from "react-router-dom";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  ArrowUpRight,
  Calendar,
  CalendarDays,
  Check,
  CheckCheck,
  Folder,
  GripVertical,
  Inbox,
  Leaf,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sun,
  Tag,
  X,
} from "lucide-react";
import { api, ApiError, errorMessage, useResource } from "./api";
import type { Label, Project, Section, Settings, Task, User } from "./types";
import { TaskEditor } from "./TaskEditor";
import type { TaskDraft } from "./TaskEditor";
import { EntityEditor } from "./EntityEditor";
import type { EntityDraft } from "./EntityEditor";
import { TaskList, DropArea, ScheduledTaskList } from "./TaskList";
import { CalendarView } from "./CalendarView";
import { KanbanBoard, ProjectGroupedList } from "./ProjectViews";
import { SettingsPage } from "./SettingsPage";
import { SidebarFooter, SidebarToggle } from "./SidebarToggle";
import { useSidebarState } from "./useSidebarState";
import { Modal } from "./Modal";
import { Dropdown } from "./Dropdown";
import { localDate } from "./dates";

const NotesWorkspace = lazy(async () => {
  const module = await import("./NotesApp");
  return { default: module.NotesApp };
});

const NutritionWorkspace = lazy(async () => {
  const module = await import("./NutritionApp");
  return { default: module.NutritionApp };
});

export function App() {
  const location = useLocation();
  const session = useResource<User>("/auth/me");
  if (session.isPending)
    return (
      <div className="loading-screen">
        <Leaf />
        Abriendo tu espacio…
      </div>
    );
  if (session.error instanceof ApiError && session.error.status === 401)
    return <Login />;
  if (session.isError)
    return (
      <div className="loading-screen">
        <p role="alert">No se puede conectar con la API.</p>
        <button
          className="primary"
          onClick={() => {
            void session.refetch();
          }}
        >
          Reintentar
        </button>
      </div>
    );
  if (location.pathname.startsWith("/notes"))
    return (
      <Suspense
        fallback={<div className="loading-screen">Cargando notas…</div>}
      >
        <NotesWorkspace />
      </Suspense>
    );
  if (location.pathname.startsWith("/nutrition"))
    return (
      <Suspense
        fallback={<div className="loading-screen">Cargando nutrición…</div>}
      >
        <NutritionWorkspace />
      </Suspense>
    );
  return <Workspace />;
}
function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const client = useQueryClient();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const user = await api<User>("/auth/login", "POST", {
        username,
        password,
      });
      client.setQueryData(["/auth/me"], user);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="login">
      <div className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Leaf size={24} />
          </span>
          personal life<span className="brand-period">.</span>
        </div>
        <div>
          <div className="eyebrow">MENOS RUIDO. MÁS ESPACIO.</div>
          <h1>
            Haz sitio para
            <br />
            lo que importa<span>.</span>
          </h1>
          <p>
            Tus ideas, tus planes y tu próximo paso.
            <br />
            Todo empieza por un poco de claridad.
          </p>
          <div className="login-art">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-leaf">
              <Leaf size={90} strokeWidth={1} />
            </div>
            <div className="art-note">
              <Check size={16} />
              Una cosa a la vez
            </div>
          </div>
        </div>
        <span className="muted">Un espacio personal para tu día a día.</span>
      </div>
      <section className="login-form">
        <div className="eyebrow">BIENVENIDO A TU ESPACIO</div>
        <h2>Qué bueno verte.</h2>
        <p className="muted">Inicia sesión y continúa donde lo dejaste.</p>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          className="editor"
        >
          <label>
            Usuario
            <input
              autoFocus
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={pending}>
            {pending ? "Entrando…" : "Entrar"}
            <ArrowUpRight size={16} />
          </button>
        </form>
        <p className="login-footnote">
          <Leaf size={13} />
          Solo tú. A tu ritmo.
        </p>
      </section>
    </main>
  );
}
function Workspace() {
  const projectQuery = useResource<Project[]>("/projects");
  const sectionQuery = useResource<Section[]>("/sections");
  const labelQuery = useResource<Label[]>("/labels");
  const settingsQuery = useResource<Settings>("/settings");
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [entity, setEntity] = useState<EntityDraft | null>(null);
  const [navOpen, setNavOpen] = useSidebarState();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState("");
  const [days, setDays] = useState("7");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    path: string;
  } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const client = useQueryClient();
  const location = useLocation();
  const route = location.pathname;
  const projectId = route.startsWith("/project/") ? route.slice(9) : null;
  const labelId = route.startsWith("/label/") ? route.slice(7) : null;
  const projects = projectQuery.data ?? [];
  const sections = sectionQuery.data ?? [];
  const labels = labelQuery.data ?? [];
  const settings = settingsQuery.data;
  const selectedProject = projects.find((project) => project.id === projectId);
  const selectedLabel = labels.find((label) => label.id === labelId);
  const view =
    route === "/inbox"
      ? "inbox"
      : route === "/upcoming"
        ? "upcoming"
        : route === "/calendar"
          ? "calendar"
          : route === "/completed"
            ? "completed"
            : "today";
  const params = new URLSearchParams({
    sort: sort || settings?.default_sort || "manual",
    days,
  });
  if (projectId) params.set("project_id", projectId);
  if (labelId) params.set("label", labelId);
  if (search) params.set("q", search);
  const endpoint = search
    ? "/search"
    : projectId || labelId
      ? "/tasks"
      : view === "calendar"
        ? "/tasks"
        : `/views/${view}`;
  const taskQuery = useResource<Task[]>(`${endpoint}?${params.toString()}`);
  const tasks = taskQuery.data ?? [];
  const [viewOverride, setViewOverride] = useState<"list" | "board" | null>(
    null,
  );
  const completedParams = new URLSearchParams({
    sort: sort || settings?.default_sort || "manual",
    status: "completed",
  });
  if (projectId) completedParams.set("project_id", projectId);
  const projectCompletedQuery = useResource<Task[]>(
    projectId ? `/tasks?${completedParams.toString()}` : "/views/completed",
  );
  const projectCompletedTasks = projectId
    ? (projectCompletedQuery.data ?? [])
    : [];
  const openedTaskId = useRef<string | null>(null);
  const linkedTaskId = new URLSearchParams(location.search).get("task");
  const linkedTaskQuery = useResource<Task[]>("/tasks");
  useEffect(() => {
    const linkedTask = linkedTaskQuery.data?.find(
      (task) => task.id === linkedTaskId,
    );
    if (linkedTask && openedTaskId.current !== linkedTaskId) {
      openedTaskId.current = linkedTaskId;
      setDraft({ task: linkedTask });
    }
  }, [linkedTaskId, linkedTaskQuery.data]);
  const todayQuery = useResource<Task[]>("/views/today");
  const completedQuery = useResource<Task[]>("/views/completed");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  useEffect(() => {
    setSearch("");
    setSearchOpen(false);
    setSort("");
    setViewOverride(null);
    if (window.innerWidth <= 800) setNavOpen(false);
  }, [route, setNavOpen]);
  useAppearance(settings);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const editing =
        event.target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) ||
          event.target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (
        !editing &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.key.toLowerCase() === "q" &&
        !draft &&
        !entity
      ) {
        event.preventDefault();
        setDraft({ projectId });
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [draft, entity, projectId]);
  async function mutate(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, method, body);
      await client.invalidateQueries();
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function action(task: Task, actionName: string) {
    if (actionName === "delete") {
      setConfirmation({
        title: "Eliminar tarea",
        description: `Se eliminará «${task.title}» y todas sus subtareas. Esta acción no se puede deshacer.`,
        path: `/tasks/${task.id}`,
      });
      return;
    }
    void mutate(`/tasks/${task.id}/${actionName}`, "POST", {});
  }
  const boardView: "list" | "board" =
    viewOverride ?? selectedProject?.default_view ?? "list";
  function setBoardView(mode: "list" | "board") {
    setViewOverride(mode);
    if (selectedProject && selectedProject.default_view !== mode) {
      void mutate(`/projects/${selectedProject.id}`, "PATCH", {
        default_view: mode,
      });
    }
  }
  function reorder(task: Task, direction: number) {
    const siblings = tasks
      .filter(
        (candidate) =>
          candidate.parent_task_id === task.parent_task_id &&
          candidate.project_id === task.project_id &&
          candidate.section_id === task.section_id,
      )
      .sort((left, right) => left.position - right.position);
    const index = siblings.findIndex((candidate) => candidate.id === task.id);
    if (index + direction < 0 || index + direction >= siblings.length) return;
    const target = siblings[index + (direction > 0 ? 2 : -1)];
    void mutate(`/tasks/${task.id}/reorder`, "PATCH", {
      before_id: target?.id ?? null,
    });
  }
  function reorderCollection(
    collection: "projects" | "sections",
    item: Project | Section,
    direction: number,
  ) {
    const siblings =
      collection === "projects" && "parent_project_id" in item
        ? projects.filter(
            (project) => project.parent_project_id === item.parent_project_id,
          )
        : sections.filter(
            (section) =>
              "project_id" in item && section.project_id === item.project_id,
          );
    const index = siblings.findIndex((candidate) => candidate.id === item.id);
    if (index + direction < 0 || index + direction >= siblings.length) return;
    void mutate(`/${collection}/${item.id}/reorder`, "PATCH", {
      before_id: siblings[index + (direction > 0 ? 2 : -1)]?.id ?? null,
    });
  }
  function dragEnd(event: DragEndEvent) {
    const allTasks =
      projectId && projectCompletedTasks.length > 0
        ? [...tasks, ...projectCompletedTasks]
        : tasks;
    const task = allTasks.find((candidate) => candidate.id === event.active.id);
    if (!task || !event.over || event.active.id === event.over.id) return;
    if (task.status === "completed") return;
    const targetId = String(event.over.id);
    if (targetId === "date:" || targetId.startsWith("date:")) {
      // date:YYYY-MM-DD o date:YYYY-MM-DD:HH:MM (franja horaria del time-grid).
      const rest = targetId.slice(5) || null;
      const newDate = rest ? rest.slice(0, 10) : null;
      const newTime = rest && rest.length > 10 ? rest.slice(11, 16) : undefined;
      if (
        (task.due_date ?? null) === newDate &&
        (newTime === undefined || (task.due_time ?? "").slice(0, 5) === newTime)
      )
        return;
      void mutate(`/tasks/${task.id}`, "PATCH", {
        due_date: newDate,
        ...(newDate
          ? newTime !== undefined
            ? { due_time: newTime }
            : {}
          : { due_time: null }),
      });
      return;
    }
    if (targetId.startsWith("project:")) {
      void mutate(`/tasks/${task.id}/move`, "PATCH", {
        project_id: targetId.slice(8) || null,
        section_id: null,
        parent_task_id: null,
      });
      return;
    }
    if (targetId.startsWith("section:")) {
      void mutate(`/tasks/${task.id}/move`, "PATCH", {
        section_id: targetId.slice(8) || null,
        parent_task_id: null,
      }).then((success) => {
        if (success)
          void mutate(`/tasks/${task.id}/reorder`, "PATCH", {
            before_id: null,
          });
      });
      return;
    }
    const targetTask = allTasks.find((candidate) => candidate.id === targetId);
    if (!targetTask) return;
    if (targetTask.status !== task.status) return;
    // ¿Se soltó por debajo del centro de la tarjeta objetivo?
    // Entonces hay que insertar después (o al final si es la última).
    const initial = event.active.rect.current.initial;
    const overRect = event.over.rect;
    const insertAfter =
      initial !== null &&
      initial.top + initial.height / 2 + event.delta.y >
        overRect.top + overRect.height / 2;
    const moved =
      targetTask.section_id !== task.section_id ||
      targetTask.parent_task_id !== task.parent_task_id ||
      targetTask.project_id !== task.project_id;
    const reference = moved ? targetTask : task;
    const siblings = allTasks
      .filter(
        (candidate) =>
          candidate.id !== task.id &&
          candidate.status === reference.status &&
          candidate.project_id === reference.project_id &&
          candidate.section_id === reference.section_id &&
          candidate.parent_task_id === reference.parent_task_id,
      )
      .sort((left, right) => left.position - right.position);
    const targetIndex = siblings.findIndex(
      (candidate) => candidate.id === targetId,
    );
    if (targetIndex < 0) return;
    const beforeId = insertAfter
      ? (siblings[targetIndex + 1]?.id ?? null)
      : targetId;
    if (!moved) {
      // Sin cambio real: ya está justo antes de ese hueco.
      const whole = allTasks
        .filter(
          (candidate) =>
            candidate.status === task.status &&
            candidate.project_id === task.project_id &&
            candidate.section_id === task.section_id &&
            candidate.parent_task_id === task.parent_task_id,
        )
        .sort((left, right) => left.position - right.position);
      const selfIndex = whole.findIndex(
        (candidate) => candidate.id === task.id,
      );
      if ((whole[selfIndex + 1]?.id ?? null) === beforeId) return;
      void mutate(`/tasks/${task.id}/reorder`, "PATCH", {
        before_id: beforeId,
      });
      return;
    }
    void mutate(`/tasks/${task.id}/move`, "PATCH", {
      project_id: targetTask.project_id,
      section_id: targetTask.section_id,
      parent_task_id: targetTask.parent_task_id,
    }).then((success) => {
      if (success)
        void mutate(`/tasks/${task.id}/reorder`, "PATCH", {
          before_id: beforeId,
        });
    });
  }
  function dragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }
  const activeTask =
    (activeId &&
      [...tasks, ...projectCompletedTasks].find(
        (candidate) => candidate.id === activeId,
      )) ||
    null;
  if (
    settingsQuery.isError ||
    projectQuery.isError ||
    sectionQuery.isError ||
    labelQuery.isError
  )
    return (
      <div className="loading-screen">
        <p role="alert">No se pudieron cargar tus datos.</p>
        <button
          onClick={() => {
            void client.invalidateQueries();
          }}
        >
          Reintentar
        </button>
      </div>
    );
  if (!settings)
    return <div className="loading-screen">Preparando tu espacio…</div>;
  const today = localDate(settings.timezone);
  const completedToday = (completedQuery.data ?? []).filter(
    (task) =>
      task.completed_at &&
      localDate(settings.timezone, new Date(task.completed_at)) === today,
  ).length;
  const overdue = (todayQuery.data ?? []).filter(
    (task) => task.due_date && task.due_date < today,
  ).length;
  const title = search
    ? "Resultados de búsqueda"
    : (selectedProject?.name ??
      selectedLabel?.name ??
      (view === "inbox"
        ? "Bandeja de entrada"
        : view === "upcoming"
          ? "Próximo"
          : view === "calendar"
            ? "Calendario"
            : view === "completed"
              ? "Completadas"
              : "Hoy"));
  const listProps = {
    projects,
    labels,
    settings,
    edit: (task: Task) => setDraft({ task }),
    addChild: (task: Task) => setDraft({ parent: task }),
    action,
    reorder,
    busy,
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={dragStart}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={(event) => {
        setActiveId(null);
        dragEnd(event);
      }}
    >
      <div className={`app-shell ${navOpen ? "" : "nav-collapsed"}`}>
        {navOpen && (
          <button
            aria-label="Cerrar navegación"
            className="sidebar-backdrop"
            onClick={() => setNavOpen(false)}
          />
        )}
        <aside className={`sidebar ${navOpen ? "open" : ""}`}>
          <button className="quick-add" onClick={() => setDraft({ projectId })}>
            <Plus size={19} />
            Añadir tarea<kbd>Q</kbd>
          </button>
          <button
            className="sidebar-search"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={17} />
            Buscar<kbd>⌘ K</kbd>
          </button>
          <nav aria-label="Navegación principal">
            <DropArea id="project:">
              <NavLink to="/inbox">
                <Inbox size={18} />
                Bandeja de entrada
              </NavLink>
            </DropArea>
            <NavLink to="/today">
              <Sun size={18} />
              Hoy
              <span className="nav-count">{todayQuery.data?.length ?? 0}</span>
            </NavLink>
            <NavLink to="/upcoming">
              <CalendarDays size={18} />
              Próximo
            </NavLink>
            <NavLink to="/calendar">
              <Calendar size={18} />
              Calendario
            </NavLink>
            <NavLink to="/completed">
              <CheckCheck size={18} />
              Completadas
            </NavLink>
          </nav>
          {projects.some(
            (project) => project.favorite && !project.archived,
          ) && (
            <>
              <div className="nav-heading">FAVORITOS</div>
              <nav>
                {projects
                  .filter((project) => project.favorite && !project.archived)
                  .map((project) => (
                    <NavLink key={project.id} to={`/project/${project.id}`}>
                      <span className="accent-marker">#</span>
                      {project.name}
                    </NavLink>
                  ))}
              </nav>
            </>
          )}
          <div className="nav-heading">
            MIS PROYECTOS
            <button
              aria-label="Nuevo proyecto"
              className="icon-button"
              onClick={() => setEntity({ kind: "projects" })}
            >
              <Plus size={16} />
            </button>
          </div>
          <nav className="project-nav">
            <ProjectTree
              projects={projects.filter((project) => !project.archived)}
              parentId={null}
            />
            {projects.filter((project) => !project.archived).length === 0 && (
              <p className="sidebar-hint">Dale un lugar a tus planes.</p>
            )}
          </nav>
          <NavLink className="manage-link" to="/projects">
            <Folder size={15} />
            Gestionar proyectos
          </NavLink>
          <div className="sidebar-divider" />
          <nav>
            <NavLink to="/labels">
              <Tag size={17} />
              Etiquetas
            </NavLink>
            {labels
              .filter((label) => label.favorite)
              .map((label) => (
                <NavLink key={label.id} to={`/label/${label.id}`}>
                  <span className="accent-marker">#</span>
                  {label.name}
                </NavLink>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <nav>
              <NavLink to="/configuration">
                <SettingsIcon size={17} />
                Configuración
              </NavLink>
              <button
                onClick={() => {
                  void mutate("/auth/logout", "POST", {}).then((success) => {
                    if (success) client.clear();
                  });
                }}
              >
                <LogOut size={17} />
                Cerrar sesión
              </button>
            </nav>
            <SidebarFooter
              open={navOpen}
              onToggle={() => setNavOpen(!navOpen)}
            />
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
            <button
              className="icon-button mobile-menu mobile-fab"
              aria-label="Abrir navegación"
              onClick={() => setNavOpen(true)}
            >
              <Menu size={20} />
            </button>
          </div>
          <main
            className={
              view === "calendar"
                ? "main-content calendar-full"
                : "main-content"
            }
          >
            {error && (
              <div className="error banner" role="alert">
                {error}
                <button
                  className="icon-button"
                  aria-label="Cerrar error"
                  onClick={() => setError("")}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {route === "/configuration" ? (
              <SettingsPage settings={settings} />
            ) : route === "/projects" || route === "/labels" ? (
              <>
                <div className="eyebrow">TODO EN SU LUGAR</div>
                <div className="page-heading">
                  <h1>{route === "/projects" ? "Proyectos" : "Etiquetas"}</h1>
                  <button
                    className="primary"
                    onClick={() =>
                      setEntity(
                        route === "/projects"
                          ? { kind: "projects" }
                          : { kind: "labels" },
                      )
                    }
                  >
                    <Plus size={16} />
                    Crear
                  </button>
                </div>
                <p className="page-subtitle">
                  Organiza tus tareas de la forma que tenga sentido para ti.
                </p>
                <div className="entity-grid">
                  {(route === "/projects" ? projects : labels).map(
                    (item: Project | Label) => (
                      <article className="entity-card" key={item.id}>
                        <NavLink
                          to={`/${route === "/projects" ? "project" : "label"}/${item.id}`}
                        >
                          <span className="accent-marker">#</span>
                          <h2>{item.name}</h2>
                        </NavLink>
                        {"archived" in item && item.archived && (
                          <span className="tag">Archivado</span>
                        )}
                        <div>
                          {"archived" in item && (
                            <>
                              <button
                                aria-label={`Subir proyecto ${item.name}`}
                                onClick={() =>
                                  reorderCollection("projects", item, -1)
                                }
                              >
                                ↑
                              </button>
                              <button
                                aria-label={`Bajar proyecto ${item.name}`}
                                onClick={() =>
                                  reorderCollection("projects", item, 1)
                                }
                              >
                                ↓
                              </button>
                            </>
                          )}
                          <button
                            className="text-button"
                            onClick={() =>
                              setEntity(
                                "archived" in item
                                  ? { kind: "projects", value: item }
                                  : { kind: "labels", value: item },
                              )
                            }
                          >
                            Editar
                          </button>
                          <button
                            className="text-button danger"
                            onClick={() =>
                              setConfirmation({
                                title: "Eliminar",
                                description: `Eliminar «${item.name}». Sus tareas se conservarán${route === "/projects" ? " en la bandeja de entrada" : ""}.`,
                                path: `${route}/${item.id}`,
                              })
                            }
                          >
                            Eliminar
                          </button>
                        </div>
                      </article>
                    ),
                  )}
                </div>
                {(route === "/projects" ? projects : labels).length === 0 && (
                  <Empty
                    title="Empieza a organizar tu espacio"
                    text="Crea tu primer elemento con el botón de arriba."
                  />
                )}
              </>
            ) : route === "/calendar" ? (
              <>
                {taskQuery.isPending ? (
                  <p className="muted loading">Cargando tareas…</p>
                ) : taskQuery.isError ? (
                  <p role="alert" className="error">
                    No se pudieron cargar las tareas.{" "}
                    <button
                      onClick={() => {
                        void taskQuery.refetch();
                      }}
                    >
                      Reintentar
                    </button>
                  </p>
                ) : (
                  <CalendarView
                    tasks={tasks}
                    settings={settings}
                    labels={labels}
                    projects={projects}
                    today={today}
                    busy={busy}
                    edit={(task: Task) => setDraft({ task })}
                    action={action}
                    addTask={(dueDate, dueTime) =>
                      setDraft({
                        projectId,
                        dueDate: dueDate ?? today,
                        dueTime: dueTime ?? null,
                      })
                    }
                  />
                )}
              </>
            ) : (
              <>
                <div className="eyebrow">
                  {!projectId && !labelId && view === "today"
                    ? "UN NUEVO DÍA, A TU RITMO"
                    : projectId
                      ? "UN ESPACIO PARA TUS PLANES"
                      : "UN POCO MÁS DE CLARIDAD"}
                </div>
                <div className="page-heading">
                  <div>
                    <h1>
                      {title}
                      {view === "today" &&
                        !projectId &&
                        !labelId &&
                        !search && (
                          <span className="heading-sun" aria-hidden="true">
                            ☀
                          </span>
                        )}
                    </h1>
                  </div>
                  <button
                    className="primary add-main"
                    onClick={() => setDraft({ projectId })}
                  >
                    <Plus size={16} />
                    Añadir tarea
                  </button>
                </div>
                {!projectId && !labelId && view === "today" && !search && (
                  <div className="stats-grid">
                    <div className="stat-card">
                      <span className="stat-icon green">
                        <Sun size={20} />
                      </span>
                      <div>
                        <span>Para hoy</span>
                        <strong>
                          {
                            (todayQuery.data ?? []).filter(
                              (task) => task.due_date === today,
                            ).length
                          }
                          <small>tareas por hacer</small>
                        </strong>
                      </div>
                    </div>
                    <div className="stat-card">
                      <span className="stat-icon orange">
                        <CalendarDays size={20} />
                      </span>
                      <div>
                        <span>Atrasadas</span>
                        <strong>
                          {overdue}
                          <small>
                            {overdue === 0
                              ? "todo al día"
                              : "puedes retomarlas hoy"}
                          </small>
                        </strong>
                      </div>
                    </div>
                    <div className="stat-card">
                      <span className="stat-icon purple">
                        <CheckCheck size={20} />
                      </span>
                      <div>
                        <span>Completadas hoy</span>
                        <strong>
                          {completedToday}
                          <small>pequeñas victorias</small>
                        </strong>
                      </div>
                    </div>
                  </div>
                )}
                <div className="list-toolbar">
                  <div className="list-title">
                    <span className="list-icon">☷</span>
                    Mis tareas
                    <span className="count-badge">{tasks.length}</span>
                  </div>
                  <div>
                    {selectedProject && (
                      <>
                        <div
                          className="view-toggle"
                          role="group"
                          aria-label="Cambiar vista del proyecto"
                        >
                          <button
                            className={boardView === "list" ? "active" : ""}
                            aria-pressed={boardView === "list"}
                            onClick={() => setBoardView("list")}
                          >
                            Lista
                          </button>
                          <button
                            className={boardView === "board" ? "active" : ""}
                            aria-pressed={boardView === "board"}
                            onClick={() => setBoardView("board")}
                          >
                            Tablero
                          </button>
                        </div>
                        <button
                          className="text-button"
                          onClick={() =>
                            setEntity({
                              kind: "sections",
                              projectId: selectedProject.id,
                            })
                          }
                        >
                          <Plus size={14} />
                          Nueva sección
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Editar proyecto"
                          onClick={() =>
                            setEntity({
                              kind: "projects",
                              value: selectedProject,
                            })
                          }
                        >
                          <SlidersHorizontal size={16} />
                        </button>
                      </>
                    )}
                    {view === "upcoming" && !projectId && (
                      <Dropdown
                        ariaLabel="Días próximos"
                        variant="inline"
                        value={days}
                        onChange={setDays}
                        options={[
                          { value: "7", label: "7 días" },
                          { value: "14", label: "14 días" },
                          { value: "30", label: "30 días" },
                        ]}
                      />
                    )}
                    <Dropdown
                      ariaLabel="Ordenar tareas"
                      variant="inline"
                      value={sort || settings.default_sort}
                      onChange={setSort}
                      options={[
                        { value: "manual", label: "Orden manual" },
                        { value: "date", label: "Fecha" },
                        { value: "priority", label: "Prioridad" },
                        { value: "created", label: "Creación" },
                        { value: "name", label: "Nombre" },
                      ]}
                    />
                  </div>
                </div>
                {taskQuery.isPending ? (
                  <p className="muted loading">Cargando tareas…</p>
                ) : taskQuery.isError ? (
                  <p role="alert" className="error">
                    No se pudieron cargar las tareas.{" "}
                    <button
                      onClick={() => {
                        void taskQuery.refetch();
                      }}
                    >
                      Reintentar
                    </button>
                  </p>
                ) : selectedProject ? (
                  boardView === "board" ? (
                    <KanbanBoard
                      tasks={tasks}
                      completedTasks={projectCompletedTasks}
                      sections={sections.filter(
                        (section) => section.project_id === projectId,
                      )}
                      projects={projects}
                      labels={labels}
                      settings={settings}
                      projectId={selectedProject.id}
                      edit={(task: Task) => setDraft({ task })}
                      addChild={(task: Task) => setDraft({ parent: task })}
                      action={action}
                      reorder={reorder}
                      busy={busy}
                      addTask={(sectionId) =>
                        setDraft({ projectId, sectionId })
                      }
                      addSection={() =>
                        setEntity({
                          kind: "sections",
                          projectId: selectedProject.id,
                        })
                      }
                      editSection={(section) =>
                        setEntity({
                          kind: "sections",
                          value: section,
                          projectId: section.project_id,
                        })
                      }
                      deleteSection={(section) =>
                        setConfirmation({
                          title: "Eliminar sección",
                          description:
                            "Las tareas se conservarán sin sección dentro del proyecto.",
                          path: `/sections/${section.id}`,
                        })
                      }
                    />
                  ) : (
                    <ProjectGroupedList
                      tasks={tasks}
                      completedTasks={projectCompletedTasks}
                      sections={sections.filter(
                        (section) => section.project_id === projectId,
                      )}
                      projects={projects}
                      labels={labels}
                      settings={settings}
                      projectId={selectedProject.id}
                      edit={(task: Task) => setDraft({ task })}
                      addChild={(task: Task) => setDraft({ parent: task })}
                      action={action}
                      reorder={reorder}
                      busy={busy}
                      addTask={(sectionId) =>
                        setDraft({ projectId, sectionId })
                      }
                      addSection={() =>
                        setEntity({
                          kind: "sections",
                          projectId: selectedProject.id,
                        })
                      }
                      editSection={(section) =>
                        setEntity({
                          kind: "sections",
                          value: section,
                          projectId: section.project_id,
                        })
                      }
                      deleteSection={(section) =>
                        setConfirmation({
                          title: "Eliminar sección",
                          description:
                            "Las tareas se conservarán sin sección dentro del proyecto.",
                          path: `/sections/${section.id}`,
                        })
                      }
                    />
                  )
                ) : tasks.length === 0 ? (
                  <Empty
                    title={
                      view === "completed"
                        ? "Tus avances tendrán su lugar aquí"
                        : search
                          ? "No encontramos esas tareas"
                          : "No hay nada por aquí"
                    }
                    text={
                      view === "completed"
                        ? "Las tareas que completes aparecerán en esta vista."
                        : search
                          ? "Prueba con otro título, proyecto o etiqueta."
                          : "No tienes tareas en esta vista. Añade tu próximo paso cuando quieras."
                    }
                  />
                ) : !search &&
                  !labelId &&
                  (view === "today" || view === "upcoming") ? (
                  <ScheduledTaskList
                    {...listProps}
                    tasks={tasks}
                    today={today}
                  />
                ) : (
                  <TaskList {...listProps} tasks={tasks} />
                )}
                {!selectedProject && (
                  <button
                    className="inline-add"
                    onClick={() => setDraft({ projectId })}
                  >
                    <Plus size={17} />
                    Añadir tarea<span>Pulsa Q para añadir rápidamente</span>
                  </button>
                )}
              </>
            )}
          </main>
        </div>
        {draft && (
          <TaskEditor
            draft={draft}
            projects={projects}
            sections={sections}
            labels={labels}
            timezone={settings.timezone}
            onClose={() => setDraft(null)}
          />
        )}{" "}
        {entity && (
          <EntityEditor
            draft={entity}
            projects={projects}
            onClose={() => setEntity(null)}
          />
        )}{" "}
        {searchOpen && (
          <Modal
            title="Buscar en tu espacio"
            onClose={() => setSearchOpen(false)}
          >
            <form
              className="editor"
              onSubmit={(event) => {
                event.preventDefault();
                setSearchOpen(false);
              }}
            >
              <label>
                Buscar tareas
                <input
                  autoFocus
                  placeholder="Título, descripción, proyecto o etiqueta…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <button className="primary">Ver resultados</button>
            </form>
          </Modal>
        )}{" "}
        {confirmation && (
          <Modal
            title={confirmation.title}
            onClose={() => setConfirmation(null)}
          >
            <div className="editor">
              <p>{confirmation.description}</p>
              <footer className="form-footer">
                <button
                  className="secondary"
                  onClick={() => setConfirmation(null)}
                >
                  Cancelar
                </button>
                <button
                  className="danger-button"
                  disabled={busy}
                  onClick={() => {
                    void mutate(confirmation.path, "DELETE").then((success) => {
                      if (success) setConfirmation(null);
                    });
                  }}
                >
                  Eliminar definitivamente
                </button>
              </footer>
            </div>
          </Modal>
        )}
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="drag-preview">
              <GripVertical size={15} />
              <span className="drag-preview-title">{activeTask.title}</span>
              {activeTask.label_ids.map((id) => {
                const label = labels.find((candidate) => candidate.id === id);
                return label ? (
                  <span
                    key={id}
                    className="label-pill"
                    style={{
                      backgroundColor: `${label.color}2e`,
                      color: label.color,
                      border: `1px solid ${label.color}66`,
                    }}
                  >
                    {label.name}
                  </span>
                ) : null;
              })}
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
function ProjectTree({
  projects,
  parentId,
}: {
  projects: Project[];
  parentId: string | null;
}) {
  return (
    <>
      {projects
        .filter(
          (project) =>
            project.parent_project_id === parentId ||
            (parentId === null &&
              project.parent_project_id &&
              !projects.some(
                (candidate) => candidate.id === project.parent_project_id,
              )),
        )
        .map((project) => (
          <div className="project-branch" key={project.id}>
            <DropArea id={`project:${project.id}`}>
              <NavLink to={`/project/${project.id}`}>
                <span className="project-hash accent-marker">#</span>
                {project.name}
              </NavLink>
            </DropArea>
            <div className="project-children">
              <ProjectTree projects={projects} parentId={project.id} />
            </div>
          </div>
        ))}
    </>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <div className="empty-illustration">
        <Leaf size={35} strokeWidth={1.3} />
        <span />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
