/**
 * The state a write request carries.
 *
 * Read here rather than in each controller so that "what a body has to look
 * like" is one answer. Nothing beyond the shape is judged: `admit` is what
 * decides which of these paths the schema will accept.
 */
import { NotFoundException } from "@nestjs/common";
import type { FormState } from "@perchjs/core";

export function readState(body: unknown): FormState {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new NotFoundException();
  }
  const { state } = body as Record<string, unknown>;
  if (typeof state !== "object" || state === null || Array.isArray(state)) {
    throw new NotFoundException();
  }
  return state as FormState;
}
