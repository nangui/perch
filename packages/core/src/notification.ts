/**
 * What an action says when it is done.
 *
 * A builder rather than an object literal, for the reason every other builder
 * here is one: it is the shape a reader already knows, and it leaves room for
 * the channels that arrive later without changing what an action returns.
 *
 * It carries no timing and no channel. Where it is shown and for how long is
 * the renderer's business, and an action that decided it would be deciding
 * something it cannot see.
 */

export type NotificationTone = "success" | "warning" | "danger" | "info";

export interface NotificationState {
  readonly title: string;
  readonly body?: string;
  readonly tone: NotificationTone;
}

export class Notification {
  readonly state: NotificationState;

  private constructor(state: NotificationState) {
    this.state = state;
  }

  static make(): Notification {
    // Neutral until something says otherwise. An empty title is what the audit
    // catches, not what this pretends to fill in.
    return new Notification({ title: "", tone: "info" });
  }

  /** Every fluent method clones: a builder shared between requests leaks. */
  private with(state: Partial<NotificationState>): Notification {
    return new Notification({ ...this.state, ...state });
  }

  title(text: string): Notification {
    return this.with({ title: text });
  }

  body(text: string): Notification {
    return this.with({ body: text });
  }

  success(): Notification {
    return this.with({ tone: "success" });
  }

  warning(): Notification {
    return this.with({ tone: "warning" });
  }

  danger(): Notification {
    return this.with({ tone: "danger" });
  }
}
