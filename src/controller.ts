import { transition, type State, type Command, type Change } from './domain';
export interface Store {
  load(): Promise<State>;
  save(change: Change): Promise<void>;
}

export class Controller {
  private tail: Promise<unknown> = Promise.resolve();
  private failed = false;
  state: State | null = null;
  constructor(
    private store: Store,
    private now: () => number,
    private publish: (state: State) => void,
  ) {}
  private queue<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.tail.then(operation);
    this.tail = task.catch(() => undefined);
    return task;
  }
  load(): Promise<void> {
    return this.queue(async () => {
      this.failed = true;
      const state = await this.store.load();
      const change = transition(state, { type: 'reconcile' }, this.now());
      if (change.events.length) await this.store.save(change);
      this.state = change.state;
      this.failed = false;
      this.publish(change.state);
    });
  }
  dispatch(command: Command): Promise<void> {
    return this.queue(async () => {
      if (this.failed || !this.state)
        throw new Error('Reload saved state before continuing.');
      const change = transition(this.state, command, this.now());
      // Display refreshes do not write. Transitions and preferences are acknowledged only after commit.
      if (command.type !== 'reconcile' || change.events.length) {
        try {
          await this.store.save(change);
        } catch (error) {
          this.failed = true;
          throw error;
        }
        this.state = change.state;
        this.publish(change.state);
      }
    });
  }
}
