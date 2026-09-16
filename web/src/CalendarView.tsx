import { useMemo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { Label, Project, Settings, Task } from "./types";
import { DropArea } from "./TaskList";
import { Modal } from "./Modal";
import { Dropdown } from "./Dropdown";
import { formatDate, formatTime } from "./dates";
import { loadCalendarMode, saveCalendarMode } from "./preferences";
import type { CalendarMode as Mode } from "./preferences";

interface CalendarProps {
  tasks: Task[];
  settings: Settings;
  labels: Label[];
  projects: Project[];
  today: string;
  busy: boolean;
  edit: (task: Task) => void;
  action: (task: Task, action: string) => void;
  addTask: (dueDate: string | null, dueTime?: string | null) => void;
}

/** Tareas visibles por celda antes de ofrecer el resto en el modal del día. */
const MONTH_PREVIEW = 4;
/** Tope de nodos por lista para no reventar el DOM. */
const LIST_LIMIT = 100;
/** Altura de cada franja horaria del time-grid. */
const HOUR_HEIGHT = 46;

function toISO(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function parseISO(date: string): { year: number; month: number; day: number } {
  const parts = date.split("-").map(Number);
  return { year: parts[0] ?? 0, month: parts[1] ?? 1, day: parts[2] ?? 1 };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function addDaysISO(date: string, delta: number): string {
  const { year, month, day } = parseISO(date);
  const base = new Date(year, month - 1, day + delta);
  return toISO(base.getFullYear(), base.getMonth() + 1, base.getDate());
}

function startOfWeekISO(date: string, weekStart: number): string {
  const { year, month, day } = parseISO(date);
  const base = new Date(year, month - 1, day);
  const delta = (base.getDay() - weekStart + 7) % 7;
  return addDaysISO(date, -delta);
}

const WEEKDAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const WEEKDAYS_LONG = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

function weekdayOf(date: string): number {
  const { year, month, day } = parseISO(date);
  return new Date(year, month - 1, day).getDay();
}

function hourOf(time: string | null): number | null {
  if (!time) return null;
  const hour = Number(time.slice(0, 2));
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

function hourLabel(hour: number, hourFormat: "12" | "24"): string {
  if (hourFormat === "24") return `${String(hour).padStart(2, "0")}:00`;
  const twelve = hour % 12 || 12;
  return `${twelve} ${hour < 12 ? "AM" : "PM"}`;
}

function sortDayTasks(a: Task, b: Task): number {
  if ((a.due_time ?? "") !== (b.due_time ?? "")) {
    if (!a.due_time) return 1;
    if (!b.due_time) return -1;
    return a.due_time.localeCompare(b.due_time);
  }
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.position - b.position;
}

/** Color de la barra: proyecto de la tarea, o acento de la cuenta en Inbox. */
function barColor(task: Task, projects: Project[], accent: string): string {
  return (
    projects.find((project) => project.id === task.project_id)?.color ?? accent
  );
}

export function CalendarView(props: CalendarProps) {
  const [mode, setModeState] = useState<Mode>(loadCalendarMode);
  const [anchor, setAnchor] = useState(props.today);
  const [detailDay, setDetailDay] = useState<string | null>(null);
  const [showOverdue, setShowOverdue] = useState(
    () =>
      props.tasks.filter(
        (t) => t.status === "pending" && t.due_date && t.due_date < props.today,
      ).length <= 6,
  );
  const [showUndated, setShowUndated] = useState(
    () =>
      props.tasks.filter((t) => t.status === "pending" && !t.due_date).length <=
      6,
  );

  const weekStart = props.settings.week_start === 0 ? 0 : 1;
  const weekdays = useMemo(
    () => [
      ...WEEKDAYS_SHORT.slice(weekStart),
      ...WEEKDAYS_SHORT.slice(0, weekStart),
    ],
    [weekStart],
  );

  function setMode(next: Mode) {
    setModeState(next);
    saveCalendarMode(next);
  }

  const byDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of props.tasks) {
      if (task.status !== "pending" || !task.due_date) continue;
      const list = map.get(task.due_date) ?? [];
      list.push(task);
      map.set(task.due_date, list);
    }
    for (const list of map.values()) list.sort(sortDayTasks);
    return map;
  }, [props.tasks]);

  const overdue = useMemo(
    () =>
      props.tasks
        .filter(
          (t) =>
            t.status === "pending" && t.due_date && t.due_date < props.today,
        )
        .sort(
          (a, b) =>
            (a.due_date ?? "").localeCompare(b.due_date ?? "") ||
            sortDayTasks(a, b),
        ),
    [props.tasks, props.today],
  );

  const undated = useMemo(
    () =>
      props.tasks
        .filter((t) => t.status === "pending" && !t.due_date)
        .sort((a, b) => a.position - b.position),
    [props.tasks],
  );

  const anchorParts = parseISO(anchor);
  const dateFormat = props.settings.date_format;

  /** Fechas visibles para las vistas de columnas / agenda. */
  const rangeDates = useMemo<string[]>(() => {
    if (mode === "day") return [anchor];
    if (mode === "multiday")
      return [anchor, addDaysISO(anchor, 1), addDaysISO(anchor, 2)];
    if (mode === "week") {
      const start = startOfWeekISO(anchor, weekStart);
      return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
    }
    if (mode === "multiweek") {
      const start = startOfWeekISO(anchor, weekStart);
      return Array.from({ length: 14 }, (_, i) => addDaysISO(start, i));
    }
    if (mode === "agenda")
      return Array.from({ length: 14 }, (_, i) => addDaysISO(anchor, i));
    return [];
  }, [mode, anchor, weekStart]);

  const monthCells = useMemo(() => {
    const { year, month } = anchorParts;
    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const offset = (firstWeekday - weekStart + 7) % 7;
    const total = daysInMonth(year, month);
    const prevTotal = daysInMonth(
      month === 1 ? year - 1 : year,
      month === 1 ? 12 : month - 1,
    );
    const list: { date: string; inMonth: boolean }[] = [];
    for (let i = offset - 1; i >= 0; i--) {
      const day = prevTotal - i;
      const pm = month === 1 ? 12 : month - 1;
      const py = month === 1 ? year - 1 : year;
      list.push({ date: toISO(py, pm, day), inMonth: false });
    }
    for (let day = 1; day <= total; day++) {
      list.push({ date: toISO(year, month, day), inMonth: true });
    }
    let nextDay = 1;
    let nm = month === 12 ? 1 : month + 1;
    let ny = month === 12 ? year + 1 : year;
    while (list.length % 7 !== 0 || list.length < 35) {
      if (list.length >= 35 && list.length % 7 === 0) break;
      list.push({ date: toISO(ny, nm, nextDay), inMonth: false });
      nextDay++;
      if (nextDay > daysInMonth(ny, nm)) {
        nextDay = 1;
        nm = nm === 12 ? 1 : nm + 1;
        if (nm === 1) ny++;
      }
      if (list.length >= 42) break;
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorParts.year, anchorParts.month, weekStart]);

  const title =
    mode === "year"
      ? String(anchorParts.year)
      : mode === "month"
        ? new Intl.DateTimeFormat("es-ES", {
            month: "long",
            year: "numeric",
          }).format(new Date(anchorParts.year, anchorParts.month - 1, 1))
        : mode === "day"
          ? `${WEEKDAYS_LONG[weekdayOf(anchor)]}, ${formatDate(anchor, dateFormat)}`
          : mode === "agenda"
            ? `Agenda · ${new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date(anchorParts.year, anchorParts.month - 1, 1))}`
            : `${formatDate(rangeDates[0] ?? anchor, dateFormat)} – ${formatDate(rangeDates[rangeDates.length - 1] ?? anchor, dateFormat)}`;

  function move(delta: number) {
    if (mode === "year") {
      const maxDay = daysInMonth(anchorParts.year + delta, anchorParts.month);
      setAnchor(
        toISO(
          anchorParts.year + delta,
          anchorParts.month,
          Math.min(anchorParts.day, maxDay),
        ),
      );
      return;
    }
    if (mode === "month") {
      const total = anchorParts.year * 12 + (anchorParts.month - 1) + delta;
      const year = Math.floor(total / 12);
      const month = (total % 12) + 1;
      const maxDay = daysInMonth(year, month);
      setAnchor(toISO(year, month, Math.min(anchorParts.day, maxDay)));
      return;
    }
    setAnchor(addDaysISO(anchor, delta));
  }

  function goToDay(date: string) {
    setAnchor(date);
    setMode("day");
  }

  function goToMonth(year: number, month: number) {
    setAnchor(toISO(year, month, 1));
    setMode("month");
  }

  const step =
    mode === "year"
      ? 1
      : mode === "month"
        ? 1
        : mode === "week"
          ? 7
          : mode === "day"
            ? 1
            : mode === "multiday"
              ? 3
              : 14;
  const prevLabel =
    mode === "year"
      ? "Año anterior"
      : mode === "month"
        ? "Mes anterior"
        : mode === "week" || mode === "multiweek"
          ? "Semanas anteriores"
          : "Anterior";
  const nextLabel =
    mode === "year"
      ? "Año siguiente"
      : mode === "month"
        ? "Mes siguiente"
        : mode === "week" || mode === "multiweek"
          ? "Semanas siguientes"
          : "Siguiente";

  const detailTasks = detailDay ? (byDate.get(detailDay) ?? []) : [];

  return (
    <div className="calendar">
      <div className="calendar-toolbar">
        <h2 className="calendar-title">{title}</h2>
        <div className="calendar-tools">
          <button
            className="icon-button calendar-add"
            aria-label="Añadir tarea"
            onClick={() => props.addTask(anchor)}
          >
            <Plus size={18} />
          </button>
          <Dropdown
            ariaLabel="Vista del calendario"
            variant="inline"
            value={mode}
            searchable={false}
            onChange={(next) => setMode(next as Mode)}
            options={[
              { value: "year", label: "Año" },
              { value: "month", label: "Mes" },
              { value: "week", label: "Semana" },
              { value: "day", label: "Día" },
              { value: "agenda", label: "Agenda" },
              { value: "multiday", label: "3 días" },
              { value: "multiweek", label: "2 sem." },
            ]}
          />
          <div
            className="calendar-nav"
            role="group"
            aria-label="Cambiar periodo"
          >
            <button
              className="secondary"
              aria-label={prevLabel}
              onClick={() => move(-step)}
            >
              ←
            </button>
            <button
              className="secondary"
              onClick={() => setAnchor(props.today)}
            >
              Hoy
            </button>
            <button
              className="secondary"
              aria-label={nextLabel}
              onClick={() => move(step)}
            >
              →
            </button>
          </div>
        </div>
      </div>

      {overdue.length > 0 && (
        <section className="calendar-band" aria-label="Tareas atrasadas">
          <button
            className="calendar-band-head"
            aria-expanded={showOverdue}
            onClick={() => setShowOverdue(!showOverdue)}
          >
            {showOverdue ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
            <span>Atrasadas · {overdue.length}</span>
          </button>
          {showOverdue && (
            <div className="calendar-band-list">
              {overdue.map((task) => (
                <TaskBar key={task.id} {...props} task={task} compact />
              ))}
            </div>
          )}
        </section>
      )}

      {undated.length > 0 && (
        <DropArea id="date:">
          <section className="calendar-band" aria-label="Tareas sin fecha">
            <button
              className="calendar-band-head"
              aria-expanded={showUndated}
              onClick={() => setShowUndated(!showUndated)}
            >
              {showUndated ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <span>Sin fecha · {undated.length}</span>
            </button>
            {showUndated && (
              <div className="calendar-band-list">
                {undated.map((task) => (
                  <TaskBar key={task.id} {...props} task={task} compact />
                ))}
              </div>
            )}
          </section>
        </DropArea>
      )}

      {(mode === "month" || mode === "multiweek") && (
        <MonthGrid
          {...props}
          dates={
            mode === "month"
              ? monthCells
              : rangeDates.map((date) => ({ date, inMonth: true }))
          }
          weekdays={weekdays}
          onDetail={setDetailDay}
        />
      )}

      {(mode === "day" || mode === "week" || mode === "multiday") && (
        <TimeGrid {...props} dates={rangeDates} onDetail={setDetailDay} />
      )}

      {mode === "agenda" && (
        <AgendaList {...props} dates={rangeDates} onDetail={setDetailDay} />
      )}

      {mode === "year" && (
        <YearGrid
          {...props}
          year={anchorParts.year}
          onDay={goToDay}
          onMonth={goToMonth}
        />
      )}

      {detailDay && (
        <Modal
          title={`${WEEKDAYS_LONG[weekdayOf(detailDay)]}, ${formatDate(detailDay, dateFormat)} · ${detailTasks.length}`}
          onClose={() => setDetailDay(null)}
        >
          <div className="editor calendar-detail">
            <div className="calendar-detail-list">
              {detailTasks.slice(0, LIST_LIMIT).map((task) => (
                <TaskBar key={task.id} {...props} task={task} />
              ))}
              {detailTasks.length > LIST_LIMIT && (
                <p className="muted">
                  Mostrando {LIST_LIMIT} de {detailTasks.length}.
                </p>
              )}
              {detailTasks.length === 0 && (
                <p className="muted">Sin tareas este día.</p>
              )}
            </div>
            <footer className="form-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => setDetailDay(null)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  const date = detailDay;
                  setDetailDay(null);
                  props.addTask(date);
                }}
              >
                <Plus size={14} />
                Añadir este día
              </button>
            </footer>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Barra de tarea con el color de su proyecto. Arrastrable y completable. */
function TaskBar({
  task,
  projects,
  settings,
  busy,
  edit,
  action,
  compact,
}: CalendarProps & { task: Task; compact?: boolean }) {
  const sortable = useSortable({ id: task.id, disabled: busy });
  const color = barColor(task, projects, settings.accent_color);
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.4 : 1,
        backgroundColor: `${color}2e`,
        borderColor: `${color}66`,
      }}
      className="calendar-bar"
      {...sortable.attributes}
      {...sortable.listeners}
    >
      <button
        className="calendar-check"
        aria-label={`Completar ${task.title}`}
        disabled={busy}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => action(task, "complete")}
      >
        <Check size={11} />
      </button>
      <button
        className="calendar-bar-main"
        onClick={() => {
          if (!sortable.isDragging) edit(task);
        }}
        title={task.title}
      >
        <span className="calendar-bar-title">{task.title}</span>
        {!compact && task.due_time && (
          <span className="calendar-bar-time">
            {formatTime(task.due_time, settings.hour_format)}
          </span>
        )}
      </button>
    </div>
  );
}

/** Rejilla estilo mes: celdas de altura flexible con scroll interno. */
function MonthGrid({
  dates,
  weekdays,
  onDetail,
  ...props
}: CalendarProps & {
  dates: { date: string; inMonth: boolean }[];
  weekdays: string[];
  onDetail: (date: string) => void;
}) {
  return (
    <>
      <div className="calendar-weekdays" aria-hidden="true">
        {weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {dates.map(({ date, inMonth }) => {
          const dayTasks = props.tasks
            .filter(
              (task) => task.status === "pending" && task.due_date === date,
            )
            .sort(sortDayTasks);
          const isToday = date === props.today;
          const dayNumber = Number(date.split("-")[2]);
          const visible = dayTasks.slice(0, MONTH_PREVIEW);
          return (
            <DropArea key={date} id={`date:${date}`}>
              <div
                className={`calendar-day ${inMonth ? "" : "outside"} ${isToday ? "today" : ""} ${date < props.today ? "past" : ""}`}
              >
                <div className="calendar-day-head">
                  <span className="calendar-day-number">{dayNumber}</span>
                  <button
                    className="icon-button"
                    aria-label={`Añadir tarea el ${formatDate(date, props.settings.date_format)}`}
                    onClick={() => props.addTask(date)}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <div className="calendar-day-tasks">
                  {visible.map((task) => (
                    <TaskBar key={task.id} {...props} task={task} />
                  ))}
                  {dayTasks.length > MONTH_PREVIEW && (
                    <button
                      className="text-button"
                      onClick={() => onDetail(date)}
                    >
                      +{dayTasks.length - MONTH_PREVIEW} más
                    </button>
                  )}
                </div>
              </div>
            </DropArea>
          );
        })}
      </div>
    </>
  );
}

/**
 * Time-grid Día / Semana / 3 días: eje horario con franjas soltables.
 * Las tareas sin hora van a la fila "Todo el día"; el resto, a su hora.
 * Sin duraciones en el modelo, los bloques se apilan en orden, no proporcionales.
 */
function TimeGrid({
  dates,
  onDetail,
  ...props
}: CalendarProps & {
  dates: string[];
  onDetail: (date: string) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  return (
    <div className="timegrid-scroll">
      <div
        className="timegrid"
        style={{ ["--tg-cols" as string]: dates.length }}
      >
        <div className="timegrid-corner" aria-hidden="true" />
        {dates.map((date) => (
          <div
            key={`head-${date}`}
            className={`timegrid-dayhead ${date === props.today ? "today" : ""}`}
          >
            <span className="timegrid-weekday">
              {WEEKDAYS_SHORT[weekdayOf(date)]}
            </span>
            <span className="timegrid-daynum">
              {Number(date.split("-")[2])}
            </span>
            <button
              className="icon-button"
              aria-label={`Añadir tarea el ${formatDate(date, props.settings.date_format)}`}
              onClick={() => props.addTask(date)}
            >
              <Plus size={13} />
            </button>
          </div>
        ))}
        <div className="timegrid-allday-label">Todo el día</div>
        {dates.map((date) => {
          const allDay = props.tasks
            .filter(
              (task) =>
                task.status === "pending" &&
                task.due_date === date &&
                !task.due_time,
            )
            .sort(sortDayTasks);
          return (
            <DropArea key={`allday-${date}`} id={`date:${date}`}>
              <div className="timegrid-allday">
                {allDay.slice(0, LIST_LIMIT).map((task) => (
                  <TaskBar key={task.id} {...props} task={task} compact />
                ))}
                {allDay.length > LIST_LIMIT && (
                  <button
                    className="text-button"
                    onClick={() => onDetail(date)}
                  >
                    +{allDay.length - LIST_LIMIT} más
                  </button>
                )}
              </div>
            </DropArea>
          );
        })}
        {hours.map((hour) => (
          <TimeHourRow
            key={hour}
            {...props}
            dates={dates}
            hour={hour}
            onDetail={onDetail}
          />
        ))}
      </div>
    </div>
  );
}

function TimeHourRow({
  dates,
  hour,
  onDetail,
  ...props
}: CalendarProps & {
  dates: string[];
  hour: number;
  onDetail: (date: string) => void;
}) {
  const label = hourLabel(hour, props.settings.hour_format);
  const stamp = `${String(hour).padStart(2, "0")}:00`;
  return (
    <>
      <span className="timegrid-gutter" aria-hidden="true">
        {label}
      </span>
      {dates.map((date) => {
        const slot = props.tasks
          .filter(
            (task) =>
              task.status === "pending" &&
              task.due_date === date &&
              hourOf(task.due_time) === hour,
          )
          .sort(sortDayTasks);
        return (
          <DropArea key={`${date}-${stamp}`} id={`date:${date}:${stamp}`}>
            <div
              className="timegrid-slot"
              style={{ minHeight: HOUR_HEIGHT }}
              role="button"
              tabIndex={0}
              aria-label={`Añadir tarea el ${formatDate(date, props.settings.date_format)} a las ${label}`}
              onClick={(event) => {
                if (event.target === event.currentTarget)
                  props.addTask(date, stamp);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") props.addTask(date, stamp);
              }}
            >
              {slot.slice(0, LIST_LIMIT).map((task) => (
                <TaskBar key={task.id} {...props} task={task} />
              ))}
              {slot.length > LIST_LIMIT && (
                <button className="text-button" onClick={() => onDetail(date)}>
                  +{slot.length - LIST_LIMIT} más
                </button>
              )}
            </div>
          </DropArea>
        );
      })}
    </>
  );
}

/** Agenda: timeline por día con tarjetas de rango horario. */
function AgendaList({
  dates,
  onDetail,
  ...props
}: CalendarProps & {
  dates: string[];
  onDetail: (date: string) => void;
}) {
  return (
    <div className="agenda-timeline">
      {dates.map((date) => {
        const dayTasks = props.tasks
          .filter((task) => task.status === "pending" && task.due_date === date)
          .sort(sortDayTasks);
        const isToday = date === props.today;
        return (
          <section
            key={date}
            className={`agenda-day ${isToday ? "today" : ""}`}
            aria-label={`${WEEKDAYS_LONG[weekdayOf(date)]} ${formatDate(date, props.settings.date_format)}`}
          >
            <header className="agenda-day-head">
              <span className="agenda-day-num">
                {Number(date.split("-")[2])}
              </span>
              <span className="agenda-day-name">
                {WEEKDAYS_SHORT[weekdayOf(date)]}
              </span>
              <button
                className="icon-button"
                aria-label={`Añadir tarea el ${formatDate(date, props.settings.date_format)}`}
                onClick={() => props.addTask(date)}
              >
                <Plus size={14} />
              </button>
            </header>
            <DropArea id={`date:${date}`}>
              <div className="agenda-day-body">
                {dayTasks.length === 0 && <p className="muted">Sin tareas.</p>}
                {dayTasks.slice(0, LIST_LIMIT).map((task) => (
                  <div key={task.id} className="agenda-row">
                    <span className="agenda-time">
                      {task.due_time
                        ? formatTime(task.due_time, props.settings.hour_format)
                        : "—"}
                    </span>
                    <span
                      className="agenda-dot"
                      style={{
                        backgroundColor: barColor(
                          task,
                          props.projects,
                          props.settings.accent_color,
                        ),
                      }}
                      aria-hidden="true"
                    />
                    <div className="agenda-card">
                      <TaskBar {...props} task={task} />
                    </div>
                  </div>
                ))}
                {dayTasks.length > LIST_LIMIT && (
                  <button
                    className="text-button"
                    onClick={() => onDetail(date)}
                  >
                    Ver las {dayTasks.length} en detalle
                  </button>
                )}
              </div>
            </DropArea>
          </section>
        );
      })}
    </div>
  );
}

/** Año: 12 mini-meses con densidad por día. Clic → día; mes → vista mes. */
function YearGrid({
  year,
  onDay,
  onMonth,
  ...props
}: CalendarProps & {
  year: number;
  onDay: (date: string) => void;
  onMonth: (year: number, month: number) => void;
}) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    let max = 0;
    for (const task of props.tasks) {
      if (task.status !== "pending" || !task.due_date) continue;
      const next = (map.get(task.due_date) ?? 0) + 1;
      map.set(task.due_date, next);
      if (next > max) max = next;
    }
    return { map, max };
  }, [props.tasks]);
  const weekStart = props.settings.week_start === 0 ? 0 : 1;
  const weekdays = [
    ...WEEKDAYS_SHORT.slice(weekStart),
    ...WEEKDAYS_SHORT.slice(0, weekStart),
  ];
  return (
    <div className="year-grid">
      {Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        const firstWeekday = new Date(year, month - 1, 1).getDay();
        const offset = (firstWeekday - weekStart + 7) % 7;
        const total = daysInMonth(year, month);
        const cells: (string | null)[] = [
          ...Array<string | null>(offset).fill(null),
        ];
        for (let day = 1; day <= total; day++)
          cells.push(toISO(year, month, day));
        const name = new Intl.DateTimeFormat("es-ES", {
          month: "long",
        }).format(new Date(year, month - 1, 1));
        return (
          <section key={month} className="year-month" aria-label={name}>
            <button
              className="year-month-name"
              onClick={() => onMonth(year, month)}
            >
              {name}
            </button>
            <div className="year-weekdays" aria-hidden="true">
              {weekdays.map((day) => (
                <span key={day}>{day.slice(0, 1).toUpperCase()}</span>
              ))}
            </div>
            <div className="year-cells">
              {cells.map((date, position) => {
                if (!date) return <span key={position} aria-hidden="true" />;
                const count = counts.map.get(date) ?? 0;
                const intensity =
                  count === 0 || counts.max === 0
                    ? 0
                    : 20 + Math.round((80 * count) / counts.max);
                return (
                  <button
                    key={date}
                    className={`year-day ${date === props.today ? "today" : ""}`}
                    style={
                      intensity > 0
                        ? {
                            backgroundColor: `color-mix(in srgb, var(--accent) ${intensity}%, transparent)`,
                          }
                        : undefined
                    }
                    title={`${formatDate(date, props.settings.date_format)} · ${count}`}
                    aria-label={`${formatDate(date, props.settings.date_format)}, ${count} tareas`}
                    onClick={() => onDay(date)}
                  >
                    {Number(date.split("-")[2])}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
