/**
 * The panel, and what it is made of.
 */
import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";

import { HrDataAdapter } from "./adapter.js";
import { ImagesController } from "./images.controller.js";
import { DashboardPage } from "./dashboard.page.js";
import { DepartmentsResource } from "./departments.resource.js";
import { EmployeesResource } from "./employees.resource.js";
import { HeadcountWidget } from "./headcount.widget.js";
import { HoursWidget } from "./hours.widget.js";
import { LeaveResource } from "./leave.resource.js";
import { PrismaModule } from "./prisma.module.js";
import { Seed } from "./seed.js";
import { ThemeController } from "./theme.controller.js";
import { TimeLogsResource } from "./timelogs.resource.js";
import { QueryUserResolver } from "./who.js";

@Module({
  imports: [
    PrismaModule,
    PanelModule.forRoot({
      path: "/admin",
      resources: [
        EmployeesResource,
        TimeLogsResource,
        LeaveResource,
        DepartmentsResource,
      ],
      pages: [DashboardPage],
      widgets: [HeadcountWidget, HoursWidget],
      dataAdapter: HrDataAdapter,
      userResolver: QueryUserResolver,
      imports: [PrismaModule],
      // Dressed from outside, through the stable classes the panel already puts
      // on its elements. Linked after the panel's own sheet, which is what lets
      // an ordinary selector here outrank a rule the panel wrote.
      styles: ["/theme.css"],
    }),
  ],
  controllers: [ImagesController, ThemeController],
  providers: [Seed],
})
export class AppModule {}
