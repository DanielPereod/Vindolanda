import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

interface DropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  placeholder?: string;
  /** field = ancho completo tipo input · inline = compacto tipo toolbar */
  variant?: "field" | "inline";
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
}

/**
 * Dropdown custom adaptado al diseño (panel, line, soft, accent).
 * Sustituye a todos los <select> nativos: mismo comportamiento,
 * pero con botón + menú custom, búsqueda opcional y teclado accesible.
 */
export function Dropdown({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
  placeholder = "Seleccionar…",
  variant = "field",
  searchable,
  searchPlaceholder = "Buscar…",
  emptyText = "Sin resultados.",
  className = "",
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const autoSearch = searchable ?? options.length > 7;
  const selected = options.find((option) => option.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return options;
    return options.filter(
      (option) =>
        option.label.toLocaleLowerCase().includes(q) ||
        (option.hint ?? "").toLocaleLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    if (autoSearch) {
      const t = window.setTimeout(() => searchRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [open, autoSearch]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
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

  function choose(option: DropdownOption) {
    if (option.disabled) return;
    if (option.value !== value) onChange(option.value);
    setOpen(false);
  }

  function onTriggerKey(event: React.KeyboardEvent) {
    if (disabled) return;
    if (
      event.key === "ArrowDown" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onMenuKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[highlight];
      if (option) choose(option);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`custom-select custom-select--${variant} ${open ? "is-open" : ""} ${className}`}
      onKeyDown={onMenuKey}
    >
      <button
        type="button"
        className="custom-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
      >
        <span
          className={`custom-select-value ${selected ? "" : "is-placeholder"}`}
        >
          {selected?.label ?? placeholder}
        </span>
        {selected?.hint && (
          <span className="custom-select-hint">{selected.hint}</span>
        )}
        <ChevronDown
          size={15}
          className={`custom-select-chevron ${open ? "open" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && !disabled && (
        <div className="custom-select-menu" role="presentation">
          {autoSearch && (
            <div className="custom-select-search">
              <Search size={14} aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                aria-label={`Buscar en ${ariaLabel}`}
                placeholder={searchPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          )}
          <div
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className="custom-select-list"
          >
            {filtered.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value || `empty-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  className={`custom-select-option ${isSelected ? "is-selected" : ""} ${index === highlight ? "is-highlighted" : ""}`}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(option)}
                >
                  <span className="custom-select-option-label">
                    {option.label}
                  </span>
                  {option.hint && (
                    <span className="custom-select-option-hint">
                      {option.hint}
                    </span>
                  )}
                  {isSelected && (
                    <span className="custom-select-check" aria-hidden="true">
                      <Check size={14} />
                    </span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="custom-select-empty">{emptyText}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
