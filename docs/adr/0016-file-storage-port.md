# ADR 0016 — Where uploaded files go, and when

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/nest`)

## Context

`FileUpload` is the tenth and last of the v0.1 field catalogue, and the only one that needs somewhere to put bytes. Nothing in this repository decides where. There is no storage port, no upload route, and no record naming either.

`panel-assets` is not it. That reads the panel's own compiled bundle out of `@perchjs/ui/dist` under an allowlist ADR 0007 and ADR 0009 deliberately kept to one line; it has nothing to do with what a reader uploads.

The state protocol cannot carry the bytes. It is JSON in and JSON out (ADR 0003, ADR 0010), and a base64 field would put a 20 MB attachment through the resolution cycle on every keystroke of every other field on the form.

So three things have to be settled together, because the answer to each constrains the others: **where** the bytes go, **when** they go there, and **who** cleans up when something fails between the two writes.

PRD 06 §5 sets the acceptance criterion, fifth in its list: *an interrupted upload leaves neither an orphan file nor a partial row.*

## What verification established

1. **No port exists**, in any of the six packages. None declares a storage interface, and `.disk()` in PRD 06 has no implementation to name.
2. **Two writes, no shared transaction.** The bytes land in a filesystem or an object store; the path lands in PostgreSQL. `DataAdapter.transaction` covers the second and cannot cover the first. No arrangement of the two makes both atomic.
3. **Therefore one of two failure modes is always reachable**, and the criterion above cannot be met literally. Either a file exists that no row points at, or a row points at a file that does not exist. This record chooses which.
4. **They are not equally bad.** A row pointing at a missing file is a broken record a reader meets — a thumbnail that will not load, a download that 404s, and no way to tell whether the file was lost or never sent. A file no row points at is invisible, costs storage, and can be found again by comparing the store against the column.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Multipart on submit** | No orphan possible: nothing is written anywhere until one request carries everything. | Not kept. A form with three attachments becomes one long request with no progress, and a timeout loses all of it including the fields somebody typed. |
| **B. Upload on selection, commit on save** | Progress, large files, and a save that carries a path rather than a payload. | **Kept.** |
| **C. Presigned upload straight to the provider** | The bytes never touch the panel process. | Not kept for v0.1. It is an optimisation of B — the same temporary-then-commit shape with a different first leg — and it forces every adapter to be able to sign, which a local disk cannot. Reachable later without changing this record's shape. |

## Decision

**1. A storage port, filled by an adapter, in the shape `DataAdapter` already established.** `core` declares it and imports nothing; a host provides one. `.disk(name)` selects among those the panel was given, and a name nothing provides stops the boot rather than failing at the first upload.

**2. The bytes go up when the file is chosen, to a temporary prefix.** A dedicated route takes multipart, outside the state protocol, and answers with a handle. The form's value is that handle — a string like any other, which the trust boundary can judge and the resolution cycle can carry without ever holding a byte.

**3. The save commits.** The file moves from the temporary prefix to its final place **before** the row is written, and the row is written last.

That order is the whole of decision 3, and it is chosen against the criterion rather than in ignorance of it: it makes a partial row impossible and an orphan file possible. Verification 4 is why. The alternative order makes the visible failure the common one.

**4. Orphans are bounded, not tolerated**, and there are two kinds.

A file chosen and never saved stays in the temporary prefix. That is the common one — somebody closed the tab — and it is swept by age, which the framework provides and the host schedules.

A file committed while the row write fails is already in its final place, where no age sweep can tell it from a file that belongs there. The save removes it on its own failure path, so the ordinary case leaves nothing.

What survives both is one case only: the process dies between the commit and the row write, so the failure path never runs. That file is findable by comparing the store against the column and by nothing cheaper. Naming it is the point — it is the residue this record accepts, and pretending the removal covers it would make the next person stop looking.

## Consequences

- The criterion is met in the half a reader can see — no partial row, ever — and missed in the half they cannot, in one case: a process that dies mid-save. That is written here rather than claimed in a changelog.
- `FileUpload` can be built without deciding anything about S3, because the port is what it talks to.
- A second route exists outside the state protocol. It needs the same authorisation the form has, and it is the first place in the panel where a request body is not JSON — both are the field's to get right, and both are new surface.
- A host that provides no storage adapter gets a panel that boots and a `FileUpload` that stops it, which is the audit's existing shape for a field that cannot work.

## Reopening rule

**One:** a deployment target makes the panel process unable to receive the bytes at all — a serverless runtime with a request size limit below what the field must accept. Then option C stops being an optimisation and becomes the only shape, and this record is superseded by one that makes signing part of the port.

**Two:** `DataAdapter` gains a way to enlist a second resource in its transaction. Then decision 3's ordering is no longer a choice between two failures and should be revisited.

Does not reopen this: disliking that an orphan file is possible. It is possible in every arrangement without a distributed transaction. What this record owes is not impossibility but honesty about which failure it keeps, how the common one is swept, and that the last one is found by comparison or not at all.
