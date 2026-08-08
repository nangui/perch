import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const port = Number(process.env["PORT"] ?? 3000);
const app = await NestFactory.create(AppModule);
await app.listen(port);

console.log(`Perch example on http://localhost:${String(port)}/admin/people/create`);
