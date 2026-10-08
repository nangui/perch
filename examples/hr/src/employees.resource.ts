/**
 * Who works here.
 *
 * The table the rest of the panel points at, and the one that asks the most of
 * it: a relation to a department, a relation to this same table for whoever
 * they report to, a salary in a column no double can hold, and a total of it
 * under the column.
 */
import {
  AvatarColumn,
  BadgeColumn,
  DeleteAction,
  EditAction,
  Schema,
  Select,
  SelectFilter,
  Table,
  TextColumn,
  TextEntry,
  TextInput,
  ViewAction,
} from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

const EMPLOYMENT = {
  full: "Full time",
  part: "Part time",
  contract: "Contract",
};

@PanelResource({ model: "Employee", navigationGroup: "People", navigationSort: 0 })
export class EmployeesResource implements PanelResource {
  form(): Schema {
    return Schema.make([
      TextInput.make("name").required(),
      TextInput.make("email").email().required(),
      TextInput.make("jobTitle").label("Job title").required(),
      Select.make("departmentId")
        .label("Department")
        .relationship("department")
        .required(),
      // The same table on both ends. Nobody reports to everybody, so this one
      // is allowed to be empty.
      Select.make("managerId").label("Reports to").relationship("manager"),
      Select.make("employment").options(EMPLOYMENT).default("full").required(),
      TextInput.make("salary").numeric().required(),
      TextInput.make("weeklyHours")
        .label("Weekly hours")
        .numeric()
        .default(40)
        .required(),
    ]);
  }

  infolist(): Schema {
    return Schema.make([
      TextEntry.make("name"),
      TextEntry.make("jobTitle"),
      TextEntry.make("department.name").label("Department"),
      TextEntry.make("manager.name").label("Reports to"),
      TextEntry.make("employment"),
      TextEntry.make("hiredAt").label("Hired").dateTime(),
      TextEntry.make("email"),
    ]);
  }

  table(): Table {
    return Table.make()
      .columns([
        AvatarColumn.make("name").image("avatarUrl").searchable().sortable(),
        TextColumn.make("jobTitle").label("Job title").searchable(),
        TextColumn.make("department.name").label("Department").hideWhenNarrow(),
        TextColumn.make("manager.name").label("Reports to").hideWhenNarrow(),
        BadgeColumn.make("employment").color((value) =>
          value === "full" ? "success" : value === "part" ? "neutral" : "warning",
        ),
        // A money column, totalled under itself. The sum is worked out by the
        // database over every row a filter left, not over the page.
        TextColumn.make("salary")
          .money("EUR")
          .alignment("end")
          .width("9rem")
          .sortable()
          .summarise("sum", "avg"),
      ])
      .filters([SelectFilter.make("employment").options(EMPLOYMENT)])
      .actions([ViewAction.make(), EditAction.make(), DeleteAction.make()])
      .defaultSort("name");
  }
}
