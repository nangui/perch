/**
 * When somebody is away.
 *
 * It soft-deletes, which is the point of it being here: a withdrawn request
 * that is gone forever is a panel nobody trusts with the real thing, and a
 * reader can put it back.
 */
import {
  BadgeColumn,
  DateTimePicker,
  DeleteAction,
  EditAction,
  ForceDeleteAction,
  RestoreAction,
  Schema,
  Select,
  SelectFilter,
  Table,
  Textarea,
  TextColumn,
  TextEntry,
  TrashedFilter,
  ViewAction,
} from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

const KIND = {
  holiday: "Holiday",
  sick: "Sick",
  parental: "Parental",
  unpaid: "Unpaid",
};

const STATUS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

@PanelResource({ model: "LeaveRequest", navigationGroup: "People", navigationSort: 2 })
export class LeaveResource implements PanelResource {
  form(): Schema {
    return Schema.make([
      Select.make("employeeId").label("Employee").relationship("employee").required(),
      Select.make("kind").options(KIND).default("holiday").required(),
      DateTimePicker.make("startsOn").label("From").date().required(),
      DateTimePicker.make("endsOn").label("To").date().required(),
      Select.make("status").options(STATUS).default("pending").required(),
      Textarea.make("reason").rows(3),
    ]);
  }

  infolist(): Schema {
    return Schema.make([
      TextEntry.make("employee.name").label("Employee"),
      TextEntry.make("kind"),
      TextEntry.make("startsOn").label("From"),
      TextEntry.make("endsOn").label("To"),
      TextEntry.make("status"),
      TextEntry.make("reason"),
    ]);
  }

  table(): Table {
    return Table.make()
      .columns([
        TextColumn.make("employee.name").label("Employee").searchable().sortable(),
        BadgeColumn.make("kind").color(() => "neutral"),
        TextColumn.make("startsOn").label("From").sortable().width("9rem"),
        TextColumn.make("endsOn").label("To").hideWhenNarrow().width("9rem"),
        TextColumn.make("reason").hideWhenNarrow(),
        BadgeColumn.make("status").color((value) =>
          value === "approved"
            ? "success"
            : value === "rejected"
              ? "danger"
              : "warning",
        ),
      ])
      .filters([
        SelectFilter.make("status").options(STATUS),
        SelectFilter.make("kind").options(KIND),
        TrashedFilter.make(),
      ])
      .actions([
        ViewAction.make().inModal(),
        EditAction.make(),
        DeleteAction.make(),
        RestoreAction.make(),
        ForceDeleteAction.make(),
      ])
      .defaultSort("startsOn");
  }
}
