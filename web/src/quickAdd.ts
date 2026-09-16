import { es, en } from "chrono-node";
import { localDate } from "./dates";
import type { Label, Project, Section, TaskInput } from "./types";

/** Recognized offsets always refer to the original title. */
export interface QuickAddToken {
  start: number;
  end: number;
  text: string;
  kind: "project" | "section" | "label" | "priority" | "date";
  caption: string;
}
export interface QuickAddResult {
  input: TaskInput;
  recognized: string[];
  tokens: QuickAddToken[];
  warning: string | null;
}
/** Existing destination shared by recognition and autocomplete. */
export interface QuickAddTarget {
  marker: string;
  kind: "project" | "section" | "label";
  id: string | null;
  sectionId?: string | null;
}

/** Lists active destinations and global labels without creating entities. */
export function quickAddTargets(
  projects: Project[],
  sections: Section[],
  labels: Label[],
  projectId: string | null,
): QuickAddTarget[] {
  const active = projects.filter((project) => !project.archived);
  return [
    { marker: "#Bandeja de entrada", kind: "project", id: null },
    { marker: "#Inbox", kind: "project", id: null },
    ...active.map((project): QuickAddTarget => ({
      marker: `#${project.name}`,
      kind: "project",
      id: project.id,
    })),
    ...sections
      .filter((section) =>
        active.some((project) => project.id === section.project_id),
      )
      .map((section): QuickAddTarget => ({
        marker: `#${active.find((project) => project.id === section.project_id)?.name}/${section.name}`,
        kind: "project",
        id: section.project_id,
        sectionId: section.id,
      })),
    ...sections
      .filter((section) => section.project_id === projectId)
      .map((section): QuickAddTarget => ({
        marker: `/${section.name}`,
        kind: "section",
        id: section.id,
      })),
    ...labels.map((label): QuickAddTarget => ({
      marker: `@${label.name}`,
      kind: "label",
      id: label.id,
    })),
  ];
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function mask(text: string, tokens: QuickAddToken[]): string {
  return tokens.reduce(
    (result, token) =>
      result.slice(0, token.start) +
      " ".repeat(token.end - token.start) +
      result.slice(token.end),
    text,
  );
}
function targetTokens(
  value: string,
  targets: QuickAddTarget[],
  ignored: string[],
) {
  const matches: { token: QuickAddToken; target: QuickAddTarget }[] = [];
  let remaining = value;
  for (const target of [...targets].sort(
    (left, right) => right.marker.length - left.marker.length,
  )) {
    const pattern = new RegExp(
      `(?<!\\S)${escapePattern(target.marker)}(?=$|\\s|[,;!])`,
      "giu",
    );
    for (const match of remaining.matchAll(pattern)) {
      if (ignored.includes(match[0])) continue;
      const token = {
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        kind: target.kind,
        caption: target.marker,
      };
      matches.push({ token, target });
    }
    remaining = mask(
      value,
      matches.map((match) => match.token),
    );
  }
  return matches.sort((left, right) => left.token.start - right.token.start);
}
function dateTokens(
  text: string,
  timezone: string,
  now: Date,
  ignored: string[],
) {
  // Synthetic UTC reference preserves account wall-clock fields across browser timezones and DST.
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const reference = {
    instant: new Date(`${localDate(timezone, now)}T${clock}Z`),
    timezone: 0,
  };
  const literalMasked = ignored.reduce(
    (result, phrase) => result.replaceAll(phrase, " ".repeat(phrase.length)),
    text,
  );
  const normalized = literalMasked.replace(/pasado mañana/giu, (phrase) =>
    "en 2 días".padEnd(phrase.length),
  );
  const results = [
    ...es.parse(normalized, reference, { forwardDate: true }),
    ...en.GB.parse(normalized, reference, { forwardDate: true }),
  ];
  return results
    .filter(
      (result) =>
        !result.end &&
        !ignored.includes(
          text.slice(result.index, result.index + result.text.length).trim(),
        ),
    )
    .sort(
      (left, right) =>
        left.index - right.index || right.text.length - left.text.length,
    );
}

/** Pure interpretation using manual fields as the baseline. Unknown and ignored text stays literal.
 * Dates and times are local calendar fields in the supplied account timezone.
 */
export function parseQuickAdd(
  value: string,
  current: TaskInput,
  projects: Project[],
  sections: Section[],
  labels: Label[],
  timezone: string,
  now = new Date(),
  ignored: string[] = [],
): QuickAddResult {
  let input = { ...current, label_ids: [...current.label_ids] };
  const tokens: QuickAddToken[] = [];
  const targets = targetTokens(
    value,
    quickAddTargets(projects, sections, labels, null),
    ignored,
  );
  for (const { token, target } of targets) {
    tokens.push(token);
    if (target.kind === "label" && target.id) input.label_ids.push(target.id);
    if (target.kind !== "project") continue;
    input.project_id = target.id;
    input.section_id =
      target.sectionId ??
      (target.id === current.project_id ? current.section_id : null);
  }
  for (const { token, target } of targetTokens(
    mask(value, tokens),
    quickAddTargets(projects, sections, [], input.project_id).filter(
      (target) => target.kind === "section",
    ),
    ignored,
  )) {
    tokens.push(token);
    input.section_id = target.id;
  }
  if (
    input.project_id !== current.project_id ||
    input.section_id !== current.section_id
  )
    input.parent_task_id = null;
  for (const match of mask(value, tokens).matchAll(
    /(?<!\S)p([1-4])(?=$|\s|[,;!])/gi,
  )) {
    if (ignored.includes(match[0])) continue;
    input.priority = Number(match[1]);
    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      kind: "priority",
      caption: `P${input.priority}`,
    });
  }
  let remaining = mask(value, tokens);
  remaining = remaining.replace(
    /(?:https?:\/\/\S+|(?<!\S)[@#/]\S+|"[^"]*"|\{[^}]*\})/g,
    (phrase) => " ".repeat(phrase.length),
  );
  const unsupported =
    /\b(?:cada|every|daily|weekly|mensualmente|diariamente)\b/i.test(
      remaining,
    ) || /\{[^}]+\}|(?<!\S)!\S+/.test(value);
  const warning = unsupported
    ? "Las repeticiones, fechas límite y recordatorios aún no están disponibles. La expresión se conservará como texto."
    : null;
  const dates = unsupported
    ? []
    : dateTokens(remaining, timezone, now, ignored);
  let hasDate = false;
  let hasTime = false;
  for (const result of dates) {
    const prefix = /\ba\s+$/i.exec(remaining.slice(0, result.index));
    const tokenStart =
      prefix && /^las?\b/i.test(result.text) ? prefix.index : result.index;
    const originalPhrase = /^pasado mañana/iu.exec(value.slice(result.index));
    const end =
      result.index +
      Math.max(result.text.trimEnd().length, originalPhrase?.[0].length ?? 0);
    if (tokens.some((token) => result.index < token.end && end > token.start))
      continue;
    const start = result.start;
    const explicitDate =
      start.isCertain("day") ||
      start.isCertain("month") ||
      start.isCertain("year") ||
      start.isCertain("weekday");
    const explicitTime = start.isCertain("hour");
    if ((explicitDate && hasDate) || (explicitTime && hasTime)) continue;
    if (!explicitDate && !explicitTime) continue;
    const date = [start.get("year"), start.get("month"), start.get("day")]
      .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
      .join("-");
    if (explicitDate || !input.due_date) input.due_date = date;
    if (explicitTime)
      input.due_time = `${String(start.get("hour")).padStart(2, "0")}:${String(start.get("minute") ?? 0).padStart(2, "0")}`;
    hasDate ||= explicitDate;
    hasTime ||= explicitTime;
    tokens.push({
      start: tokenStart,
      end,
      text: value.slice(tokenStart, end),
      kind: "date",
      caption: `${input.due_date}${input.due_time ? ` · ${input.due_time}` : ""}`,
    });
  }
  input = {
    ...input,
    title: mask(value, tokens).replace(/\s+/g, " ").trim(),
    label_ids: [...new Set(input.label_ids)],
  };
  tokens.sort((left, right) => left.start - right.start);
  return {
    input,
    tokens,
    recognized: tokens.map((token) => token.text),
    warning,
  };
}
