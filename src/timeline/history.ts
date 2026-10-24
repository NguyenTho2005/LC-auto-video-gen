import type { TimelineState } from "./types.js";
import type { TimelineCommand } from "./commands.js";

export class TimelineHistoryManager {
  private currentState: TimelineState;
  private undoStack: TimelineCommand[] = [];
  private redoStack: TimelineCommand[] = [];
  private maxHistory: number = 50;

  constructor(initialState: TimelineState, maxHistory: number = 50) {
    this.currentState = JSON.parse(JSON.stringify(initialState));
    this.maxHistory = maxHistory;
  }

  getState(): TimelineState {
    return this.currentState;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  execute(command: TimelineCommand): void {
    const nextState = command.execute(this.currentState);
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    // Khi thực thi lệnh mới, xoá ngăn xếp redo
    this.redoStack = [];
    this.currentState = nextState;
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;

    const prevState = command.undo(this.currentState);
    this.redoStack.push(command);
    this.currentState = prevState;
    return true;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;

    const nextState = command.execute(this.currentState);
    this.undoStack.push(command);
    this.currentState = nextState;
    return true;
  }

  getHistoryInfo() {
    return {
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      lastCommand: this.undoStack[this.undoStack.length - 1]?.name,
    };
  }
}
