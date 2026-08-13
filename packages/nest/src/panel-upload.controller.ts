/**
 * `POST {path}/api/:resource/upload`.
 *
 * The one route in the panel whose body is not JSON. A file goes up when it is
 * chosen (ADR 0016), lands in the staging prefix, and answers with a key the
 * form carries like any other string — so the resolution cycle never holds a
 * byte, and the trust boundary judges a handle rather than an attachment.
 *
 * Every rule the field declared is enforced here and nowhere else that counts.
 * A file input's `accept` filters a dialog and a size check in the page is a
 * courtesy; both are gone the moment somebody posts here directly, which they
 * will.
 *
 * The refusals say what is wrong with the file, because the reader chose it and
 * has to be able to choose another. They say nothing about the form: a path
 * that is not a `FileUpload`, a field they may not write, and a resource they
 * may not reach all answer the same 404 the rest of the panel answers.
 */
import {
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { DataAdapter, FormState, Row, StagedFile } from "@perchjs/core";
import { FileUpload } from "@perchjs/core";
import { admit } from "./admission.js";
import { authorize } from "./authorization.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import { recordId } from "./record-id.js";
import { ResourceRegistry } from "./resource-registry.js";
import type { PanelDisks } from "./storage.token.js";
import { PANEL_STORAGE } from "./storage.token.js";
import type { UserResolver } from "./user-resolver.js";
import { PANEL_USER_RESOLVER } from "./user-resolver.js";

/**
 * What the multipart parser hands over.
 *
 * Declared structurally rather than imported: the shape is multer's, and taking
 * `@types/multer` for four properties would be a dependency for a type.
 */
interface UploadedPart {
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;
  readonly buffer: Uint8Array;
}

/**
 * What the parser will take before it stops reading, whatever any field says.
 *
 * Not the policy — `.maxSize()` is, and it is checked below — but a backstop,
 * because without one the bytes are buffered whole and only then refused, which
 * makes a route anybody authorised can reach into a way to exhaust the process.
 *
 * A constant rather than an option because the interceptor is built when this
 * class is defined, before any module has been configured. Making it settable
 * means building the interceptor per module, which is a change to how the route
 * is mounted rather than to this number.
 */
export const UPLOAD_CEILING_BYTES = 32 * 1024 * 1024;

export interface UploadAnswer {
  readonly file: StagedFile;
}

@Controller("api/:resource")
export class PanelUploadController {
  readonly #registry: ResourceRegistry;
  readonly #users: UserResolver;
  readonly #data: DataAdapter | null;
  readonly #disks: PanelDisks;

  constructor(
    registry: ResourceRegistry,
    @Inject(PANEL_USER_RESOLVER) users: UserResolver,
    @Inject(PANEL_DATA_ADAPTER) data: DataAdapter | null,
    @Inject(PANEL_STORAGE) disks: PanelDisks,
  ) {
    this.#registry = registry;
    this.#users = users;
    this.#data = data;
    this.#disks = disks;
  }

  @Post("upload")
  @HttpCode(200)
  // Memory, because the port takes bytes, and bounded twice: the parser stops
  // at the ceiling so nothing larger is ever held, and the field's own limit is
  // checked below.
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: UPLOAD_CEILING_BYTES } }),
  )
  async upload(
    @Param("resource") slug: string,
    @UploadedFile() part: UploadedPart | undefined,
    @Req() request: unknown,
  ): Promise<UploadAnswer> {
    const body = readBody(request);
    const resource = this.#registry.get(slug);
    if (resource === undefined) throw new NotFoundException();

    const user = this.#users.resolve(request);
    const record = await this.#record(resource.metadata.model, body);
    const verdict = await authorize(
      resource.instance.can,
      record === null ? "create" : "edit",
      user,
      record ?? undefined,
    );
    if (verdict !== "allowed") throw new NotFoundException();

    // Resolved with the state the reader has on screen, and through admission
    // rather than from it: a field whose visibility depends on another is
    // invisible to an empty tree, and the reader looking straight at the
    // control would be told the field does not exist.
    const { tree } = await admit({
      schema: resource.instance.form(),
      state: body.state,
      operation: record === null ? "create" : "edit",
      user,
      record,
    });

    const found = tree.nodes.find(
      (node): node is typeof node & { component: FileUpload } =>
        node.component instanceof FileUpload && node.component.name === body.path,
    );
    if (found === undefined) throw new NotFoundException();
    // A field they may not write is a field they may not fill.
    if (!found.visible || found.disabled || found.readOnly)
      throw new NotFoundException();

    const field = found.component;
    const disk = this.#disks[field.state.disk];
    if (disk === undefined) throw new NotFoundException();

    if (part === undefined) throw new UnprocessableEntityException("No file was sent.");
    const { maxSize } = field.state;
    if (maxSize !== undefined && part.size > maxSize) {
      throw new UnprocessableEntityException(
        `That file is ${String(part.size)} bytes, and the limit is ${String(maxSize)}.`,
      );
    }
    if (!field.accepts(part.mimetype)) {
      throw new UnprocessableEntityException(
        `Files of type ${part.mimetype} are not accepted.`,
      );
    }

    const file = await disk.stage({
      name: part.originalname,
      type: part.mimetype,
      bytes: part.buffer,
    });
    return { file };
  }

  async #record(model: string, body: UploadBody): Promise<Row | null> {
    if (body.id === undefined || this.#data === null) return null;

    const key = recordId(this.#data, model, body.id);
    if (key === null) throw new NotFoundException();

    const row = await this.#data.findOne(model, key);
    if (row === null) throw new NotFoundException();
    return row;
  }
}

interface UploadBody {
  readonly path: string;
  readonly state: FormState;
  readonly id?: string;
}

/**
 * The fields beside the file, which multipart carries as text.
 *
 * A malformed envelope is refused, and that is the only message here about the
 * request rather than about the file.
 */
function readBody(request: unknown): UploadBody {
  const body = (request as { body?: unknown }).body;
  if (typeof body !== "object" || body === null) throw new NotFoundException();

  const { path, id, state } = body as Record<string, unknown>;
  if (typeof path !== "string" || path.length === 0) throw new NotFoundException();

  return {
    path,
    // Multipart carries text, so the form's state arrives as one field of JSON.
    // Unreadable is empty rather than an error: it goes through admission like
    // anything else a client sends, which is where it stops being trusted.
    state: readState(state),
    ...(typeof id === "string" && id.length > 0 ? { id } : {}),
  };
}

function readState(raw: unknown): FormState {
  if (typeof raw !== "string" || raw === "") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as FormState)
      : {};
  } catch {
    return {};
  }
}
