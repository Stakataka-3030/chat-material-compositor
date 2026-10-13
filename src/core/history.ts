export class History<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];
  constructor(private limit = 100) {}
  record(before: T) {
    this.undoStack.push(structuredClone(before));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }
  undo(current: T): T | null {
    const p = this.undoStack.pop();
    if (!p) return null;
    this.redoStack.push(structuredClone(current));
    return p;
  }
  redo(current: T): T | null {
    const p = this.redoStack.pop();
    if (!p) return null;
    this.undoStack.push(structuredClone(current));
    return p;
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
