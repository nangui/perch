import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const port = Number(process.env["PORT"] ?? 3000);
const app = await NestFactory.create(AppModule);
await app.listen(port);

console.log(`Perch example on http://localhost:${String(port)}/admin/people/create`);
// Said on every boot, because a restart looks exactly like a save that was
// lost — and telling those two apart from the outside is impossible.
console.log("Rows live in memory: restarting starts over from the seed data.");
