import { useState } from "react";
import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  ChevronRight,
  Copy,
  GripVertical,
  Plus,
  Trash2,
  CalendarDays,
  CornerDownRight,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { Label, Project, Settings, Task } from "./types";
import { formatDate, formatTime, isOverdue } from "./dates";
interface ListProps {
  tasks: Task[];
  projects: Project[];
  labels: Label[];
  settings: Settings;
  edit: (task: Task) => void;
  addChild: (task: Task) => void;
  action: (task: Task, action: string) => void;
  reorder: (task: Task, direction: number) => void;
  busy: boolean;
}
export function TaskList(props: ListProps) {
  const visibleIds = new Set(props.tasks.map((task) => task.id));
  const roots = props.tasks.filter(
    (task) => !task.parent_task_id || !visibleIds.has(task.parent_task_id),
  );
  return (
    <SortableContext
      items={props.tasks.map((task) => task.id)}
      strategy={verticalListSortingStrategy}
    >
      <div className="task-list">
        {roots.map((task) => (
          <TaskRow key={task.id} {...props} task={task} />
        ))}
      </div>
    </SortableContext>
  );
}
function TaskRow(props: ListProps & { task: Task }) {
  const { task, settings } = props;
  const [expanded, setExpanded] = useState(true);
  const [actions, setActions] = useState(false);
  const sortable = useSortable({ id: task.id, disabled: props.busy });
  const children = props.tasks.filter(
    (candidate) => candidate.parent_task_id === task.id,
  );
  const project = props.projects.find(
    (candidate) => candidate.id === task.project_id,
  );
  const overdue =
    task.status === "pending" &&
    isOverdue(task.due_date, task.due_time, settings.timezone);
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.4 : 1,
      }}
      className="task-tree"
    >
      <div
        className={`task-row ${task.status === "completed" ? "completed" : ""}`}
      >
        <button
          className="drag-handle"
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label={`Arrastrar ${task.title}`}
        >
          <GripVertical size={16} />
        </button>
        <button
          className={`complete-button priority-${task.priority}`}
          aria-label={`${task.status === "completed" ? "Restaurar" : "Completar"} ${task.title}`}
          disabled={props.busy}
          onClick={() =>
            props.action(
              task,
              task.status === "completed" ? "uncomplete" : "complete",
            )
          }
        >
          {task.status === "completed" && <Check size={13} />}
        </button>
        <button className="task-content" onClick={() => props.edit(task)}>
          <span className="task-title">{task.title}</span>
          <span className="task-meta">
            {task.due_date && (
              <span className={overdue ? "overdue" : "schedule"}>
                <CalendarDays size={12} />
                {overdue ? "Atrasada · " : ""}
                {formatDate(task.due_date, settings.date_format)}
                {task.due_time
                  ? ` · ${formatTime(task.due_time, settings.hour_format)}`
                  : ""}
              </span>
            )}
            {task.completed_at && (
              <span>
                Completada ·{" "}
                {new Intl.DateTimeFormat("es-ES", {
                  timeZone: settings.timezone,
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(task.completed_at))}
              </span>
            )}
            {task.label_ids.map((id) => {
              const label = props.labels.find(
                (candidate) => candidate.id === id,
              );
              return label ? (
                <span key={id} className="accent-marker">
                  #{label.name}
                </span>
              ) : null;
            })}
            {children.length > 0 && (
              <span>
                <CornerDownRight size={12} />
                {children.length}
              </span>
            )}
          </span>
        </button>
        <span className="task-project">
          {project?.name ?? "Inbox"}
          <span className="accent-marker">#</span>
        </span>
        <button
          className="icon-button task-options"
          aria-label={`Acciones de ${task.title}`}
          aria-expanded={actions}
          onClick={() => setActions(!actions)}
        >
          ···
        </button>
      </div>
      {actions && (
        <div className="task-actions">
          <button onClick={() => props.addChild(task)}>
            <Plus size={14} />
            Subtarea
          </button>
          <button
            disabled={props.busy}
            onClick={() => props.action(task, "duplicate")}
          >
            <Copy size={14} />
            Duplicar
          </button>
          <button disabled={props.busy} onClick={() => props.reorder(task, -1)}>
            <ArrowUp size={14} />
            Subir
          </button>
          <button disabled={props.busy} onClick={() => props.reorder(task, 1)}>
            <ArrowDown size={14} />
            Bajar
          </button>
          <button
            className="danger"
            disabled={props.busy}
            onClick={() => props.action(task, "delete")}
          >
            <Trash2 size={14} />
            Eliminar
          </button>
        </div>
      )}
      {children.length > 0 && (
        <div className="subtask-area">
          <button
            className="subtask-toggle"
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronRight
              size={12}
              style={{ transform: expanded ? "rotate(90deg)" : undefined }}
            />
            {expanded ? "Ocultar" : "Mostrar"} subtareas
          </button>
          {expanded &&
            children.map((child) => (
              <TaskRow key={child.id} {...props} task={child} />
            ))}
        </div>
      )}
    </div>
  );
}
export function DropArea({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={isOver ? "drop-area over" : "drop-area"}>
      {children}
    </div>
  );
}

/** Keeps date-based views grouped without creating synthetic projects or tasks. */
export function ScheduledTaskList(props: ListProps & { today: string }) {
  const keys = [
    ...new Set(
      props.tasks.map((task) =>
        task.due_date && task.due_date < props.today
          ? "overdue"
          : (task.due_date ?? "undated"),
      ),
    ),
  ];
  return (
    <>
      {keys.map((key) => (
        <section key={key}>
          <h3 className={`section-title ${key === "overdue" ? "overdue" : ""}`}>
            {key === "overdue"
              ? "Atrasadas"
              : key === props.today
                ? "Para hoy"
                : key === "undated"
                  ? "Sin fecha"
                  : formatDate(key, props.settings.date_format)}
          </h3>
          <TaskList
            {...props}
            tasks={props.tasks.filter(
              (task) =>
                (task.due_date && task.due_date < props.today
                  ? "overdue"
                  : (task.due_date ?? "undated")) === key,
            )}
          />
        </section>
      ))}
    </>
  );
}
