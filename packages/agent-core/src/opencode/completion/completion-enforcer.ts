import { CompletionState, CompletionFlowState, CompleteTaskArgs } from './completion-state.js';
import { getContinuationPrompt, getPartialContinuationPrompt, getIncompleteTodosPrompt } from './prompts.js';
import type { TodoItem } from '../../common/types/todo.js';

export interface CompletionEnforcerCallbacks {
  onStartContinuation: (prompt: string) => Promise<void>;
  onComplete: () => void;
  onDebug: (type: string, message: string, data?: unknown) => void;
}

export type StepFinishAction = 'continue' | 'pending' | 'complete';

export class CompletionEnforcer {
  private static readonly MAX_TODO_DOWNGRADES = 3;

  private state: CompletionState;
  private callbacks: CompletionEnforcerCallbacks;
  private currentTodos: TodoItem[] = [];
  private toolsWereUsed: boolean = false;
  private todoDowngradeAttempts: number = 0;
  // If more downgrade reasons are added, replace this boolean with a union type:
  // private downgradeReason: 'none' | 'incomplete_todos' | '...' = 'none';
  private todoDowngradeTriggered: boolean = false;

  constructor(callbacks: CompletionEnforcerCallbacks, maxContinuationAttempts: number = 10) {
    this.callbacks = callbacks;
    this.state = new CompletionState(maxContinuationAttempts);
  }

  updateTodos(todos: TodoItem[]): void {
    this.currentTodos = todos;
    this.callbacks.onDebug(
      'todo_update',
      `Todo list updated: ${todos.length} items`,
      { todos }
    );
  }

  markToolsUsed(): void {
    this.toolsWereUsed = true;
  }

  handleCompleteTaskDetection(toolInput: unknown): boolean {
    if (this.state.isCompleteTaskCalled()) {
      return false;
    }

    const args = toolInput as {
      status?: string;
      summary?: string;
      original_request_summary?: string;
      remaining_work?: string;
    };

    const completeTaskArgs: CompleteTaskArgs = {
      status: args?.status || 'unknown',
      summary: args?.summary || '',
      original_request_summary: args?.original_request_summary || '',
      remaining_work: args?.remaining_work,
    };

    if (completeTaskArgs.status === 'success' && this.hasIncompleteTodos()) {
      this.todoDowngradeAttempts++;
      if (this.todoDowngradeAttempts <= CompletionEnforcer.MAX_TODO_DOWNGRADES) {
        this.callbacks.onDebug(
          'incomplete_todos',
          `Agent claimed success but has incomplete todos - downgrading to partial (attempt ${this.todoDowngradeAttempts}/${CompletionEnforcer.MAX_TODO_DOWNGRADES})`,
          { incompleteTodos: this.getIncompleteTodosSummary() }
        );
        this.todoDowngradeTriggered = true;
        completeTaskArgs.status = 'partial';
        completeTaskArgs.remaining_work = this.getIncompleteTodosSummary();
      } else {
        this.callbacks.onDebug(
          'incomplete_todos_accepted',
          `Accepting success despite incomplete todos after ${CompletionEnforcer.MAX_TODO_DOWNGRADES} downgrade attempts`,
          { incompleteTodos: this.getIncompleteTodosSummary() }
        );
      }
    }

    this.state.recordCompleteTaskCall(completeTaskArgs);

    this.callbacks.onDebug(
      'complete_task',
      `complete_task detected with status: ${completeTaskArgs.status}`,
      { args: completeTaskArgs, state: CompletionFlowState[this.state.getState()] }
    );

    return true;
  }

  handleStepFinish(reason: string): StepFinishAction {
    if (reason !== 'stop' && reason !== 'end_turn') {
      return 'continue';
    }

    if (this.state.isPendingPartialContinuation()) {
      this.callbacks.onDebug(
        'partial_continuation',
        'Scheduling continuation for partial completion',
        { remainingWork: this.state.getCompleteTaskArgs()?.remaining_work }
      );
      return 'pending';
    }

    if (!this.state.isCompleteTaskCalled()) {
      if (!this.toolsWereUsed) {
        this.callbacks.onDebug(
          'skip_continuation',
          'No tools used and no complete_task called — treating as conversational response'
        );
        return 'complete';
      }

      if (this.state.scheduleContinuation()) {
        this.callbacks.onDebug(
          'continuation',
          `Scheduled continuation prompt (attempt ${this.state.getContinuationAttempts()})`
        );
        return 'pending';
      }

      console.warn(`[CompletionEnforcer] Agent stopped without complete_task. State: ${CompletionFlowState[this.state.getState()]}, attempts: ${this.state.getContinuationAttempts()}/${this.state.getMaxContinuationAttempts()}`);
    }

    return 'complete';
  }

  async handleProcessExit(exitCode: number): Promise<void> {
    if (this.state.isPendingPartialContinuation() && exitCode === 0) {
      const args = this.state.getCompleteTaskArgs();

      let prompt: string;
      if (this.todoDowngradeTriggered) {
        prompt = getIncompleteTodosPrompt(
          args?.remaining_work || 'No remaining work specified',
          this.todoDowngradeAttempts,
          CompletionEnforcer.MAX_TODO_DOWNGRADES
        );
        this.todoDowngradeTriggered = false;
      } else {
        prompt = getPartialContinuationPrompt(
          args?.remaining_work || 'No remaining work specified',
          args?.original_request_summary || 'Unknown request',
          args?.summary || 'No summary provided'
        );
      }

      const canContinue = this.state.startPartialContinuation();

      if (!canContinue) {
        console.warn('[CompletionEnforcer] Max partial continuation attempts reached');
        this.callbacks.onComplete();
        return;
      }

      this.callbacks.onDebug(
        'partial_continuation',
        `Starting partial continuation (attempt ${this.state.getContinuationAttempts()})`,
        { remainingWork: args?.remaining_work, summary: args?.summary }
      );

      this.toolsWereUsed = false;
      await this.callbacks.onStartContinuation(prompt);
      return;
    }

    if (this.state.isPendingContinuation() && exitCode === 0) {
      const prompt = getContinuationPrompt();

      this.state.startContinuation();

      this.callbacks.onDebug(
        'continuation',
        `Starting continuation task (attempt ${this.state.getContinuationAttempts()})`
      );

      this.toolsWereUsed = false;
      await this.callbacks.onStartContinuation(prompt);
      return;
    }

    this.callbacks.onComplete();
  }

  shouldComplete(): boolean {
    return this.state.isDone() ||
           this.state.getState() === CompletionFlowState.BLOCKED ||
           this.state.getState() === CompletionFlowState.MAX_RETRIES_REACHED;
  }

  reset(): void {
    this.state.reset();
    this.currentTodos = [];
    this.toolsWereUsed = false;
    this.todoDowngradeAttempts = 0;
    this.todoDowngradeTriggered = false;
  }

  private hasIncompleteTodos(): boolean {
    return this.currentTodos.some(
      t => t.status === 'pending' || t.status === 'in_progress'
    );
  }

  private getIncompleteTodosSummary(): string {
    const incomplete = this.currentTodos.filter(
      t => t.status === 'pending' || t.status === 'in_progress'
    );
    return incomplete.map(t => `- ${t.content}`).join('\n');
  }

  getState(): CompletionFlowState {
    return this.state.getState();
  }

  getContinuationAttempts(): number {
    return this.state.getContinuationAttempts();
  }
}
