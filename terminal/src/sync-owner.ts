import { addAbortListener } from 'node:events';

export class SyncOwner<T> {
  private readonly lifetime = new AbortController();
  private pending?: Promise<T>;

  async run(start: (owner: AbortSignal) => Promise<T>, caller?: AbortSignal): Promise<T> {
    this.lifetime.signal.throwIfAborted();
    caller?.throwIfAborted();
    // Only the owner advances the shared cursor. A caller can leave without cancelling other readers.
    const work = this.pending ??= start(this.lifetime.signal).finally(() => { this.pending = undefined; });
    if (!caller) return work;
    return new Promise<T>((resolve, reject) => {
      const listener = addAbortListener(caller, () => reject(caller.reason));
      const detach = () => listener[Symbol.dispose]();
      work.then(value => { detach(); resolve(value); }, error => { detach(); reject(error); });
    });
  }

  async stop(): Promise<void> {
    this.lifetime.abort();
    await this.pending?.catch(() => {});
  }
}
