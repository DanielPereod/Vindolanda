/** A command is an action with stable identity; unregister it when its owner unloads. */
export interface WorkspaceCommand {
  id: string;
  title: string;
  shortcut?: string;
  execute: () => void | Promise<void>;
}

/** Small dynamic registry. Subscribers are notified synchronously after registration changes. */
export class CommandRegistry {
  private readonly commands = new Map<string, WorkspaceCommand>();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  /** Registers a unique command; duplicate IDs throw without replacing the existing owner. */
  register(command: WorkspaceCommand): () => void {
    if (this.commands.has(command.id))
      throw new Error(`Command already registered: ${command.id}`);
    this.commands.set(command.id, command);
    this.notify();
    return () => {
      if (this.commands.get(command.id) !== command) return;
      this.commands.delete(command.id);
      this.notify();
    };
  }

  /** Lists matching commands in fuzzy relevance order. Empty queries preserve registration order. */
  search(query: string): WorkspaceCommand[] {
    return [...this.commands.values()]
      .map((command) => ({ command, score: fuzzyScore(command.title, query) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.command);
  }

  /** Executes a registered action and propagates asynchronous errors to its caller. */
  run(identifier: string): void | Promise<void> {
    const command = this.commands.get(identifier);
    if (!command) throw new Error(`Unknown command: ${identifier}`);
    return command.execute();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): number => this.version;

  private notify() {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  }
}

/** Accent-insensitive subsequence score. Zero means no match; contiguous matches rank first. */
export function fuzzyScore(label: string, query: string): number {
  const normalize = (value: string) =>
    value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
  const text = normalize(label);
  const search = normalize(query.trim());
  if (!search) return 1;
  if (text.includes(search))
    return 1000 - text.indexOf(search) - text.length / 1000;
  let position = 0;
  let gaps = 0;
  for (const character of search) {
    const match = text.indexOf(character, position);
    if (match < 0) return 0;
    gaps += match - position;
    position = match + 1;
  }
  return 1 / (1 + gaps);
}
