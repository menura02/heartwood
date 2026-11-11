import { MatrixFailure, MatrixTransportFailure } from './matrix.ts';

export type LiveRecoveryStatus = 'connected' | 'catchingUp' | 'paused' | 'reconnecting';

interface Update { delay?: number; status?: LiveRecoveryStatus }

export class LiveRecovery {
  private failures = 0;
  private status: LiveRecoveryStatus = 'connected';
  private readonly random: () => number;

  constructor(random = Math.random) { this.random = random; }

  success(catchingUp: boolean): Update {
    this.failures = 0;
    return this.update(catchingUp ? 'catchingUp' : 'connected', catchingUp ? 50 : 1500);
  }

  fail(error: unknown): Update {
    const temporary = error instanceof MatrixTransportFailure ||
      (error instanceof MatrixFailure && [502, 503, 504].includes(error.status));
    if (!temporary || this.failures >= 5) {
      return this.update('paused');
    }
    const base = 500 * 2 ** this.failures++;
    const delay = Math.min(8000, Math.round(base * (0.75 + this.random() * 0.5)));
    return this.update('reconnecting', delay);
  }

  resume(): void { this.failures = 0; }

  private update(status: LiveRecoveryStatus, delay?: number): Update {
    const changed = this.status !== status;
    this.status = status;
    return {...(delay === undefined ? {} : {delay}), ...(changed ? {status} : {})};
  }
}
