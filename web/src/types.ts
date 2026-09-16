/** The provisioned account. Password data never leaves the API. */
export interface User {
  id: string;
  username: string;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  parent_project_id: string | null;
  favorite: boolean;
  archived: boolean;
  default_view: "list";
  position: number;
}
export interface Section {
  id: string;
  project_id: string;
  name: string;
  position: number;
}
export interface Label {
  id: string;
  name: string;
  color: string;
  favorite: boolean;
}
/** Local wall-clock scheduling fields interpreted in the account timezone. */
export interface TaskInput {
  title: string;
  description: string;
  project_id: string | null;
  section_id: string | null;
  parent_task_id: string | null;
  priority: number;
  due_date: string | null;
  due_time: string | null;
  label_ids: string[];
  note_ids?: string[];
}
export interface Task extends TaskInput {
  id: string;
  position: number;
  status: "pending" | "completed";
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
export interface Completion {
  id: string;
  task_id: string;
  scheduled_for: string | null;
  completed_at: string;
}
export interface Settings {
  timezone: string;
  language: "es";
  week_start: number;
  hour_format: "12" | "24";
  date_format: "DD/MM/YYYY" | "YYYY-MM-DD";
  theme: "light" | "dark" | "system";
  accent_color: import("./appearance").AccentColor;
  default_sort: string;
  browser_notifications: boolean;
}
