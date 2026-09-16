import { useState } from "react";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ChevronDown, ChevronRight, FileText, Plus } from "lucide-react";
import type { Label, Project, Section, Settings, Task } from "./types";
import { DropArea, TaskList } from "./TaskList";

export interface ProjectViewProps {
  tasks: Task[];
  completedTasks: Task[];
  sections: Section[];
  projects: Project[];
  labels: Label[];
  settings: Settings;
  projectId: string;
  edit: (task: Task) => void;
  addChild: (task: Task) => void;
  action: (task: Task, action: string) => void;
  reorder: (task: Task, direction: number) => void;
  busy: boolean;
  addTask: (sectionId: string | null) => void;
  addSection: () => void;
  editSection: (section: Section) => void;
  deleteSection: (section: Section) => void;
}

export function LabelPill({ label }: { label: Label }) {
  return (
    <span
      className="label-pill"
      style={{
        backgroundColor: `${label.color}2e`,
        color: label.color,
        border: `1px solid ${label.color}66`,
      }}
    >
      {label.name}
    </span>
  );
}

function taskLabels(task: Task, labels: Label[]): Label[] {
  return task.label_ids
    .map((id) => labels.find((label) => label.id === id))
    .filter((label): label is Label => Boolean(label));
}

function useCollapsed() {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  function toggle(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  return { collapsed, toggle };
}

function GroupHeader({
  name,
  count,
  collapsed,
  onToggle,
}: {
  name: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className="group-header"
      aria-expanded={!collapsed}
      onClick={onToggle}
    >
      {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
      <span>{name}</span>
      <span className="count-badge">{count}</span>
    </button>
  );
}

/** Lista por proyecto: grupos custom colapsables con contador + Completadas. */
export function ProjectGroupedList(props: ProjectViewProps) {
  const { collapsed, toggle } = useCollapsed();
  const listProps = {
    projects: props.projects,
    labels: props.labels,
    settings: props.settings,
    edit: props.edit,
    addChild: props.addChild,
    action: props.action,
    reorder: props.reorder,
    busy: props.busy,
  };
  const groups: { key: string; name: string; sectionId: string | null }[] = [
    { key: "none", name: "Sin sección", sectionId: null },
    ...props.sections.map((section) => ({
      key: section.id,
      name: section.name,
      sectionId: section.id as string | null,
    })),
  ];
  return (
    <div className="project-groups">
      {groups.map((group) => {
        const groupTasks = props.tasks.filter((task) =>
          group.sectionId
            ? task.section_id === group.sectionId
            : !task.section_id,
        );
        const isCollapsed = collapsed.has(`list:${group.key}`);
        return (
          <DropArea key={group.key} id={`section:${group.sectionId ?? ""}`}>
            <section className="project-group">
              <div className="group-header-row">
                <GroupHeader
                  name={group.name}
                  count={groupTasks.length}
                  collapsed={isCollapsed}
                  onToggle={() => toggle(`list:${group.key}`)}
                />
                <button
                  className="icon-button"
                  aria-label={`Añadir tarea en ${group.name}`}
                  onClick={() => props.addTask(group.sectionId)}
                >
                  <Plus size={15} />
                </button>
              </div>
              {!isCollapsed && (
                <>
                  <TaskList {...listProps} tasks={groupTasks} />
                  {groupTasks.length === 0 && (
                    <p className="section-empty">
                      Sin tareas. Añade o arrastra tareas aquí.
                    </p>
                  )}
                </>
              )}
            </section>
          </DropArea>
        );
      })}
      <section className="project-group">
        <div className="group-header-row">
          <GroupHeader
            name="Completed"
            count={props.completedTasks.length}
            collapsed={collapsed.has("list:completed")}
            onToggle={() => toggle("list:completed")}
          />
        </div>
        {!collapsed.has("list:completed") &&
          props.completedTasks.length > 0 && (
            <TaskList {...listProps} tasks={props.completedTasks} />
          )}
      </section>
    </div>
  );
}

function BoardCard({
  task,
  labels,
  busy,
  edit,
  action,
}: {
  task: Task;
  labels: Label[];
  busy: boolean;
  edit: (task: Task) => void;
  action: (task: Task, action: string) => void;
}) {
  const completed = task.status === "completed";
  const sortable = useSortable({ id: task.id, disabled: busy || completed });
  const pills = taskLabels(task, labels);
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.4 : 1,
      }}
      className={`board-card ${completed ? "completed" : ""}`}
      {...sortable.attributes}
      {...sortable.listeners}
    >
      <div className="board-card-top">
        <button
          className={`complete-button priority-${task.priority}`}
          aria-label={`${completed ? "Restaurar" : "Completar"} ${task.title}`}
          disabled={busy}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => action(task, completed ? "uncomplete" : "complete")}
        >
          {completed && <Check size={12} />}
        </button>
        <button
          className="board-card-title"
          onClick={() => {
            if (!sortable.isDragging) edit(task);
          }}
        >
          {task.title}
        </button>
        <span className="drag-handle board-drag" aria-hidden="true">
          ⠿
        </span>
      </div>
      {(pills.length > 0 || task.description) && (
        <div className="board-card-meta">
          {pills.map((label) => (
            <LabelPill key={label.id} label={label} />
          ))}
          {task.description && (
            <span className="board-desc" title="Tiene descripción">
              <FileText size={12} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Kanban por proyecto: columnas = Sin sección + secciones, con drag, alta y colapso. */
export function KanbanBoard(props: ProjectViewProps) {
  const { collapsed, toggle } = useCollapsed();
  const columns: {
    key: string;
    name: string;
    sectionId: string | null;
    section?: Section;
  }[] = [
    { key: "none", name: "Inbox", sectionId: null },
    ...props.sections.map((section) => ({
      key: section.id,
      name: section.name,
      sectionId: section.id as string | null,
      section,
    })),
  ];
  const allIds = [
    ...props.tasks.map((task) => task.id),
    ...props.completedTasks.map((task) => task.id),
  ];
  return (
    <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
      <div className="board-scroll">
        <div className="board">
          {columns.map((column) => {
            const pending = props.tasks
              .filter((task) =>
                column.sectionId
                  ? task.section_id === column.sectionId
                  : !task.section_id,
              )
              .sort((a, b) => a.position - b.position);
            const done = props.completedTasks.filter((task) =>
              column.sectionId
                ? task.section_id === column.sectionId
                : !task.section_id,
            );
            const isCollapsed = collapsed.has(`board:${column.key}`);
            return (
              <DropArea
                key={column.key}
                id={`section:${column.sectionId ?? ""}`}
              >
                <section className="board-column" aria-label={column.name}>
                  <header className="board-column-header">
                    <span className="board-column-title">
                      {column.name}
                      <span className="count-badge">{pending.length}</span>
                    </span>
                    <span className="board-column-actions">
                      <button
                        className="icon-button"
                        aria-label={`Añadir tarea en ${column.name}`}
                        onClick={() => props.addTask(column.sectionId)}
                      >
                        <Plus size={15} />
                      </button>
                      {column.section ? (
                        <details className="board-menu">
                          <summary aria-label={`Opciones de ${column.name}`}>
                            ···
                          </summary>
                          <div className="board-menu-items">
                            <button
                              onClick={() => {
                                const section = column.section;
                                if (section) props.editSection(section);
                              }}
                            >
                              Editar
                            </button>
                            <button
                              className="danger"
                              onClick={() => {
                                const section = column.section;
                                if (section) props.deleteSection(section);
                              }}
                            >
                              Eliminar
                            </button>
                          </div>
                        </details>
                      ) : null}
                    </span>
                  </header>
                  {isCollapsed ? (
                    <button
                      className="text-button"
                      onClick={() => toggle(`board:${column.key}`)}
                    >
                      Mostrar {pending.length} tareas
                    </button>
                  ) : (
                    <>
                      <div className="board-cards">
                        {pending.map((task) => (
                          <BoardCard
                            key={task.id}
                            task={task}
                            labels={props.labels}
                            busy={props.busy}
                            edit={props.edit}
                            action={props.action}
                          />
                        ))}
                        {pending.length === 0 && (
                          <p className="board-empty">
                            Arrastra tareas aquí o añade una nueva.
                          </p>
                        )}
                      </div>
                      {done.length > 0 && (
                        <div className="board-done">
                          <button
                            className="group-header"
                            aria-expanded={
                              !collapsed.has(`board:${column.key}:done`)
                            }
                            onClick={() => toggle(`board:${column.key}:done`)}
                          >
                            {collapsed.has(`board:${column.key}:done`) ? (
                              <ChevronRight size={14} />
                            ) : (
                              <ChevronDown size={14} />
                            )}
                            <span>Completed</span>
                            <span className="count-badge">{done.length}</span>
                          </button>
                          {!collapsed.has(`board:${column.key}:done`) &&
                            done.map((task) => (
                              <BoardCard
                                key={task.id}
                                task={task}
                                labels={props.labels}
                                busy={props.busy}
                                edit={props.edit}
                                action={props.action}
                              />
                            ))}
                        </div>
                      )}
                      <button
                        className="text-button"
                        onClick={() => toggle(`board:${column.key}`)}
                      >
                        Ocultar columna
                      </button>
                    </>
                  )}
                </section>
              </DropArea>
            );
          })}
          <div className="board-add-column">
            <button className="text-button" onClick={props.addSection}>
              <Plus size={15} />
              New section
            </button>
          </div>
        </div>
      </div>
    </SortableContext>
  );
}
