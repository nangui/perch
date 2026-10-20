/**
 * What an action answered, said in a toast.
 *
 * It was a strip above the table: it pushed the rows down by its own height,
 * stayed until the next thing happened, and had no way to be put away. Radix's
 * toast draws it over the page in a corner instead, gives it a close button,
 * holds its timer while the pointer or the focus is on it, and lets F8 reach it
 * from the keyboard. What it says is still the server's, word for word.
 *
 * One at a time, which is the guide's rule rather than this file's: a second
 * message replaces the first. The caller keys each message, so the replacement
 * is a new toast with a timer of its own rather than an old one with new words.
 *
 * How long it stays is the renderer's business, the guide says, and this is the
 * renderer. A success or a note goes after a few seconds. A warning or a danger
 * stays until it is closed: a failure that leaves on its own is one a reader
 * who looked away never learns about.
 */
import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import * as Toast from "@radix-ui/react-toast";
import { IconMark } from "./icons.js";

/** What there is to say: the server's words and the tone it chose. */
export interface Said {
  readonly title: string;
  readonly body?: string;
  readonly tone: "success" | "warning" | "danger" | "info";
}

/** Long enough to read a title and a line, not so long it covers the next row. */
const LINGERS = 5000;

/** Whether a host above already draws the corner toasts are shown in. */
const Hosted = createContext(false);

/**
 * The corner toasts are drawn in, and what lets them be reached.
 *
 * Put round anything holding more than one list, so their toasts share one
 * corner and one F8 rather than drawing a stack of corners over each other. A
 * notice with no host above it brings its own.
 */
export function NoticeHost({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <Toast.Provider label="Notification" swipeDirection="right">
      <Hosted.Provider value={true}>{children}</Hosted.Provider>
      <Toast.Viewport className="perch-toasts" />
    </Toast.Provider>
  );
}

export function Notice({
  said,
  onClose,
}: {
  readonly said: Said;
  /** Called once the toast has gone, by its timer, its button or a swipe. */
  readonly onClose: () => void;
}): ReactNode {
  const hosted = useContext(Hosted);
  const stays = said.tone === "warning" || said.tone === "danger";

  const toast = (
    <Toast.Root
      className={`perch-toast perch-toast--${said.tone}`}
      // Polite, as the strip it replaces was: the reader is told when they
      // pause, not in the middle of whatever they are doing.
      type="background"
      duration={stays ? Infinity : LINGERS}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div className="perch-toast__text">
        <Toast.Title className="perch-toast__title">{said.title}</Toast.Title>
        {said.body === undefined ? null : (
          <Toast.Description className="perch-toast__body">
            {said.body}
          </Toast.Description>
        )}
      </div>
      <Toast.Close className="perch-toast__close" aria-label="Dismiss">
        <IconMark name="close" className="perch-toast__close-mark" />
      </Toast.Close>
    </Toast.Root>
  );

  return hosted ? toast : <NoticeHost>{toast}</NoticeHost>;
}
