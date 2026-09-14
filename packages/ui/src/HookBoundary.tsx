/**
 * The blast wall around one render hook.
 *
 * A plugin that throws has to lose its own area and nothing else. Without
 * this, a component out of a package nobody in this tree wrote takes the page
 * down with it — and the page is where somebody would go to turn that plugin
 * off, so that failure is the one there is no way back from.
 *
 * A class, because catching a render is the one thing React has no hook for.
 *
 * What is drawn instead is nothing. A plugin's component is the plugin's
 * business and a reader did not ask for it; an apology in its place explains a
 * thing they were never told was coming. What they are owed is the panel, and
 * what the person running it is owed is the reason, which goes to the console.
 */
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

export interface HookBoundaryProps {
  readonly id: string;
  readonly at: string;
  readonly children: ReactNode;
}

interface HookBoundaryState {
  readonly fell: boolean;
}

export class HookBoundary extends Component<HookBoundaryProps, HookBoundaryState> {
  override state: HookBoundaryState = { fell: false };

  static getDerivedStateFromError(): HookBoundaryState {
    return { fell: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Named, because the whole point is that the panel keeps working — so
    // nothing else will make it obvious which plugin stopped.
    console.error(
      `Perch: the render hook ${this.props.id} at ${this.props.at} threw and was left out.`,
      error,
      info.componentStack,
    );
  }

  override render(): ReactNode {
    return this.state.fell ? null : this.props.children;
  }
}
