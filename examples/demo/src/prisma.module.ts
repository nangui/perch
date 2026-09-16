/**
 * The client, as something the panel's container can reach.
 *
 * `PanelModule` builds the adapter itself, in its own module, so a provider
 * declared beside it in the application is not in scope. Naming this module in
 * the panel's `imports` is how an application says which of its providers the
 * panel may inject.
 */
import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
