import { useLayoutEffect, useRef, useState } from "react";
import type { QuickAddResult, QuickAddTarget } from "./quickAdd";
import { formatDate } from "./dates";

/** Single title input with keyboard-accessible destination suggestions and reversible recognition. */
export function QuickAddTitle({
  value,
  result,
  targets,
  onChange,
  onIgnore,
  enabled,
  onEnable,
  onCreateLabel,
}: {
  value: string;
  result: QuickAddResult;
  targets: QuickAddTarget[];
  onChange: (value: string) => void;
  onIgnore: (text: string) => void;
  enabled: boolean;
  onEnable: () => void;
  onCreateLabel: (name: string) => Promise<boolean>;
}) {
  const reference = useRef<HTMLInputElement>(null);
  const pendingSelection = useRef<number | null>(null);
  useLayoutEffect(() => {
    const position = pendingSelection.current;
    if (position === null) return;
    reference.current?.focus();
    reference.current?.setSelectionRange(position, position);
    pendingSelection.current = null;
  }, [value]);
  const [cursor, setCursor] = useState(value.length);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [creating, setCreating] = useState(false);
  const trigger = /(?:^|\s)([@#/][^@#/]*)$/.exec(value.slice(0, cursor));
  const query = trigger?.[1];
  const completed =
    query &&
    result.tokens.some(
      (token) =>
        token.start === cursor - query.length &&
        token.end < cursor &&
        /\s/.test(value[token.end] ?? ""),
    );
  const suggestions =
    query && !dismissed && !completed
      ? targets
          .filter((target) =>
            target.marker
              .toLocaleLowerCase()
              .startsWith(query.toLocaleLowerCase()),
          )
          .slice(0, 8)
      : [];
  if (
    query?.startsWith("@") &&
    query.trim().length > 1 &&
    query.length <= 101 &&
    !dismissed &&
    !completed &&
    !suggestions.some(
      (target) =>
        target.marker.toLocaleLowerCase() === query.trim().toLocaleLowerCase(),
    )
  )
    suggestions.push({ marker: query.trim(), kind: "label", id: null });
  const selectedIndex = Math.min(
    activeIndex,
    Math.max(0, suggestions.length - 1),
  );
  async function choose(target: QuickAddTarget) {
    if (!query || creating) return;
    if (target.kind === "label" && target.id === null) {
      setCreating(true);
      const created = await onCreateLabel(target.marker.slice(1));
      setCreating(false);
      if (!created) return;
    }
    const insertion = `${target.marker} `;
    const start = cursor - query.length;
    pendingSelection.current = start + insertion.length;
    onChange(value.slice(0, start) + insertion + value.slice(cursor));
    setDismissed(true);
    setCursor(start + insertion.length);
  }
  return (
    <div className="quick-title">
      <label htmlFor="task-title">Título</label>
      <input
        ref={reference}
        id="task-title"
        data-autofocus
        autoFocus
        required
        maxLength={500}
        disabled={creating}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={suggestions.length > 0}
        aria-controls={suggestions.length ? "quick-add-options" : undefined}
        aria-activedescendant={
          suggestions.length ? `quick-option-${selectedIndex}` : undefined
        }
        aria-describedby="quick-add-help"
        value={value}
        placeholder="Comprar leche mañana a las 18:30 #Casa @compras p1"
        onSelect={(event) =>
          setCursor(event.currentTarget.selectionStart ?? value.length)
        }
        onChange={(event) => {
          onChange(event.target.value);
          setCursor(event.target.selectionStart ?? 0);
          setActiveIndex(0);
          setDismissed(false);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || !suggestions.length) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setDismissed(true);
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex(
              (selectedIndex +
                (event.key === "ArrowDown" ? 1 : -1) +
                suggestions.length) %
                suggestions.length,
            );
          }
          const selected = suggestions[selectedIndex];
          if ((event.key === "Enter" || event.key === "Tab") && selected) {
            event.preventDefault();
            void choose(selected);
          }
        }}
      />
      {suggestions.length > 0 && (
        <ul
          className="quick-suggestions"
          id="quick-add-options"
          role="listbox"
          aria-label="Proyectos, secciones y etiquetas"
        >
          {suggestions.map((target, index) => (
            <li
              key={target.marker}
              id={`quick-option-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                void choose(target);
              }}
            >
              {target.kind === "label" && target.id === null
                ? `Crear etiqueta ${target.marker}`
                : target.marker}
            </li>
          ))}
        </ul>
      )}
      <p id="quick-add-help" className="muted">
        Fecha natural · # proyecto · / sección · @ etiqueta · p1–p4. Enter para
        guardar.
      </p>
      {enabled && result.tokens.length > 0 && (
        <div className="quick-recognized" aria-label="Datos detectados">
          {result.tokens.map((token) => (
            <button
              type="button"
              key={`${token.start}:${token.kind}`}
              title={`Conservar «${token.text}» como texto`}
              onClick={() => onIgnore(token.text)}
            >
              {token.kind === "date"
                ? token.caption.replace(/\d{4}-\d{2}-\d{2}/g, (date) =>
                    formatDate(date),
                  )
                : token.caption}{" "}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      {enabled && result.tokens.length > 0 && (
        <p className="muted" aria-live="polite">
          Se guardará: {result.input.title || "Escribe un título para la tarea"}
        </p>
      )}
      {!enabled && (
        <button type="button" className="text-button" onClick={onEnable}>
          Reconocer fechas y atajos en el título
        </button>
      )}
      {result.warning && (
        <p role="status" className="muted">
          {result.warning}
        </p>
      )}
    </div>
  );
}
