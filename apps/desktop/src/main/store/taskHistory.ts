import Store from 'electron-store';
import type { Task, TaskMessage, TaskResult, TaskStatus } from '@accomplish/shared';

interface TaskHistorySchema {
  tasks: Task[];
  maxHistoryItems: number;
}

const DEFAULT_MAX_HISTORY_ITEMS = 100;

const taskHistoryStore = new Store<TaskHistorySchema>({
  name: 'task-history',
  defaults: {
    tasks: [],
    maxHistoryItems: DEFAULT_MAX_HISTORY_ITEMS,
  },
});

function cloneTask(task: Task): Task {
  return {
    ...task,
    messages: [...task.messages],
  };
}

function getStoredTasks(): Task[] {
  return [...taskHistoryStore.get('tasks')];
}

function commitTasks(tasks: Task[]): void {
  const maxHistoryItems = taskHistoryStore.get('maxHistoryItems');
  taskHistoryStore.set('tasks', tasks.slice(0, maxHistoryItems).map(cloneTask));
}

function updateTask(
  taskId: string,
  updater: (task: Task) => Task
): void {
  const tasks = getStoredTasks();
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index === -1) {
    return;
  }

  tasks[index] = updater(cloneTask(tasks[index]));
  commitTasks(tasks);
}

export function saveTask(task: Task): void {
  const tasks = getStoredTasks();
  const nextTask = cloneTask(task);
  const index = tasks.findIndex((existingTask) => existingTask.id === task.id);

  if (index === -1) {
    commitTasks([nextTask, ...tasks]);
    return;
  }

  tasks[index] = {
    ...tasks[index],
    ...nextTask,
    messages: [...nextTask.messages],
  };

  // Move updated tasks to the front so history stays newest-first.
  const [updatedTask] = tasks.splice(index, 1);
  commitTasks([updatedTask, ...tasks]);
}

export function getTask(taskId: string): Task | undefined {
  const task = getStoredTasks().find((entry) => entry.id === taskId);
  return task ? cloneTask(task) : undefined;
}

export function getTasks(): Task[] {
  return getStoredTasks().map(cloneTask);
}

export function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  completedAt?: string
): void {
  updateTask(taskId, (task) => ({
    ...task,
    status,
    ...(completedAt ? { completedAt } : {}),
  }));
}

export function addTaskMessage(taskId: string, message: TaskMessage): void {
  updateTask(taskId, (task) => ({
    ...task,
    messages: [...task.messages, message],
  }));
}

export function updateTaskSessionId(taskId: string, sessionId: string): void {
  updateTask(taskId, (task) => ({
    ...task,
    sessionId,
  }));
}

export function updateTaskResult(taskId: string, result: TaskResult): void {
  updateTask(taskId, (task) => ({
    ...task,
    result,
    ...(result.sessionId ? { sessionId: result.sessionId } : {}),
  }));
}

export function deleteTask(taskId: string): void {
  const tasks = getStoredTasks().filter((task) => task.id !== taskId);
  commitTasks(tasks);
}

export function clearHistory(): void {
  commitTasks([]);
}

export function setMaxHistoryItems(maxHistoryItems: number): void {
  const nextValue = Number.isFinite(maxHistoryItems) && maxHistoryItems > 0
    ? Math.floor(maxHistoryItems)
    : DEFAULT_MAX_HISTORY_ITEMS;
  taskHistoryStore.set('maxHistoryItems', nextValue);
  commitTasks(getStoredTasks());
}

export function flushPendingTasks(): void {
  // Writes are synchronous via electron-store, so there is nothing to flush.
}

export function clearTaskHistoryStore(): void {
  taskHistoryStore.clear();
  taskHistoryStore.set('tasks', []);
  taskHistoryStore.set('maxHistoryItems', DEFAULT_MAX_HISTORY_ITEMS);
}
