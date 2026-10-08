/**
 * What an hour was spent on, and whether anybody has agreed to it yet.
 *
 * The table the reference screenshot is about: a person, a span, a project and
 * a state somebody moves. Three states rather than two, because approved and
 * rejected are different answers and a flag can only hold one of them.
 */
import {
  BadgeColumn,
  DateRangeFilter,
  DateTimePicker,
  DeleteAction,
  EditAction,
  Schema,
  Select,
  SelectFilter,
  Table,
  Textarea,
  TextColumn,
  TextEntry,
  TextInput,
  ViewAction,
} from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

const STATUS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

@PanelResource({ model: "TimeLog", navigationGroup: "People", navigationSort: 1 })
export class TimeLogsResource implements PanelResource {
  form(): Schema {
    return Schema.make([
      Select.make("employeeId").label("Employee").relationship("employee").required(),
      TextInput.make("project").required(),
      DateTimePicker.make("startedAt").label("Started").required(),
      DateTimePicker.make("endedAt").label("Ended").required(),
      Select.make("status").options(STATUS).default("pending").required(),
      Textarea.make("notes").rows(3),
    ]);
  }

  infolist(): Schema {
    return Schema.make([
      TextEntry.make("employee.name").label("Employee"),
      TextEntry.make("project"),
      TextEntry.make("startedAt").label("Started").dateTime(),
      TextEntry.make("endedAt").label("Ended").dateTime(),
      TextEntry.make("status"),
      TextEntry.make("notes"),
    ]);
  }

  table(): Table {
    return Table.make()
      .columns([
        TextColumn.make("employee.name").label("Employee").searchable().sortable(),
        TextColumn.make("project").searchable(),
        TextColumn.make("startedAt")
          .label("Started")
          .dateTime()
          .sortable()
          .width("11rem"),
        TextColumn.make("endedAt")
          .label("Ended")
          .dateTime()
          .hideWhenNarrow()
          .width("11rem"),
        TextColumn.make("notes").hideWhenNarrow(),
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
        DateRangeFilter.make("startedAt").label("Started between"),
      ])
      .actions([ViewAction.make().inModal(), EditAction.make(), DeleteAction.make()])
      .defaultSort("startedAt");
  }
}
