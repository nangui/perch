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
    // Neutral until something says otherwise, and empty rather than invented:
    // a title this filled in would be words nobody wrote, shown to a reader as
    // though somebody had.
    //
    // Nothing catches an empty one, and nothing here can. The audit runs what
    // a resource declares, its form and its table and its infolist, and reads
    // the tree each answers with. A notification is in none of them: it is what
    // an action's callback returns, at the moment it returns it, and the boot
    // never runs a callback. So an action that builds one and forgets the title
    // shows a blank message, and nothing will have said so first.
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
