/**
 * Name → widget.
 *
 * The metadata is read at bootstrap and the instances are not, for the reason
 * the page registry gives: asking the container for them from a constructor
 * depends on the order it happens to build providers in.
 *
 * What is refused here is a declaration, and only a declaration. A card's
 * icons and values are checked when they are answered, because a widget's
 * numbers do not exist until somebody asks: there is nothing sitting still at
 * boot for this to read.
 */
import type { OnModuleInit } from "@nestjs/common";
import { Inject, Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import type { StatsWidget, WidgetMetadata } from "./widget.js";
import { widgetMetadata } from "./widget.js";

export const PANEL_WIDGET_TYPES = Symbol("PERCH_PANEL_WIDGET_TYPES");

export type WidgetClass = new (...args: never[]) => StatsWidget;

export interface RegisteredWidget {
  readonly metadata: WidgetMetadata;
  readonly instance: StatsWidget;
}

/** A name is an address, so it is held to what an address may be. */
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Injectable()
export class WidgetRegistry implements OnModuleInit {
  readonly #byName = new Map<string, { metadata: WidgetMetadata; type: WidgetClass }>();
  readonly #moduleRef: ModuleRef;

  constructor(
    @Inject(PANEL_WIDGET_TYPES) types: readonly WidgetClass[],
    moduleRef: ModuleRef,
  ) {
    this.#moduleRef = moduleRef;

    for (const type of types) {
      const metadata = widgetMetadata(type);
      if (metadata === undefined) {
        throw new Error(
          `${type.name} is listed in widgets but carries no @PanelWidget.`,
        );
      }

      if (!NAME.test(metadata.name)) {
        // It is a path segment, so a name with a slash or a space in it sits
        // at an address the panel never registered and answers nothing.
        throw new Error(
          `${type.name} claims the name ${JSON.stringify(metadata.name)}, which is ` +
            `not an address. Lower case, digits and single hyphens.`,
        );
      }

      const span = metadata.columnSpan;
      if (span !== undefined && (!Number.isInteger(span) || span < 1)) {
        // A width is a count of columns. Nought spans nothing and a half of
        // one spans whatever the grid rounds it to, which is a layout nobody
        // declared.
        throw new Error(
          `${type.name} asks for a columnSpan of ${String(span)}. It is a number of ` +
            `columns, so a whole one of at least one.`,
        );
      }

      const clash = this.#byName.get(metadata.name);
      if (clash !== undefined) {
        // One of the two would answer at that address and nothing on the
        // dashboard would say which, or why.
        throw new Error(
          `${type.name} and ${clash.type.name} both claim the name ` +
            `"${metadata.name}". Give one of them another name.`,
        );
      }

      this.#byName.set(metadata.name, { metadata, type });
    }
  }

  /**
   * Nothing to read at boot, and that is the decision rather than an omission.
   *
   * Every other registry audits what a resource declared. A widget declares a
   * method, and what it answers is checked where it answers it.
   */
  onModuleInit(): void {
    // Asked for here so the container has built them before a reader does,
    // which turns a missing provider into a boot failure rather than the first
    // request's.
    this.all();
  }

  /**
   * The names, without building anything.
   *
   * Read from a constructor, which is why it touches no container: the page
   * registry checks its own declarations against these before either of them
   * has an instance, and asking for one at that point depends on the order
   * providers happen to be built in.
   */
  names(): readonly string[] {
    return [...this.#byName.keys()];
  }

  get(name: string): RegisteredWidget | undefined {
    const registered = this.#byName.get(name);
    return registered === undefined ? undefined : this.#resolve(registered);
  }

  /**
   * Every widget, in the order a dashboard draws them: by `sort`, and the ones
   * that named no place after the ones that did, in the order they were
   * listed.
   */
  all(): readonly RegisteredWidget[] {
    return [...this.#byName.values()]
      .map((registered, index) => ({ registered, index }))
      .sort((a, b) => {
        const left = a.registered.metadata.sort;
        const right = b.registered.metadata.sort;
        if (left === right) return a.index - b.index;
        if (left === undefined) return 1;
        if (right === undefined) return -1;
        return left - right;
      })
      .map(({ registered }) => this.#resolve(registered));
  }

  #resolve(registered: {
    metadata: WidgetMetadata;
    type: WidgetClass;
  }): RegisteredWidget {
    return {
      metadata: registered.metadata,
      instance: this.#moduleRef.get<StatsWidget>(registered.type, { strict: false }),
    };
  }
}
