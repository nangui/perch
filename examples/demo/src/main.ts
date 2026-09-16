import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const port = Number(process.env["PORT"] ?? 3000);
const app = await NestFactory.create(AppModule);
await app.listen(port, "0.0.0.0");

console.log(`Perch demo on http://localhost:${String(port)}/admin`);
// Said out loud on every boot, because a visitor who deletes a row and comes
// back to find it there should know why rather than distrust the panel.
console.log("Anyone may edit anything here. The data goes back to how it started.");
