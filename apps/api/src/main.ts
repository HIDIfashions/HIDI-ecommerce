import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { migrationPreviewPolicy } from "./migration-preview.js";

async function bootstrap() {
  const preview = migrationPreviewPolicy();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true, trustProxy: true, bodyLimit: 1024 * 1024 }),
    { rawBody: true },
  );
  if (preview.restricted) {
    app.getHttpAdapter().getInstance().addHook("onRequest", async (request: { method: string; url: string }, reply: any) => {
      if (!preview.allows(request.method, request.url)) {
        return reply.code(503).header("Cache-Control", "no-store").send({ message: preview.message });
      }
    });
  }
  app.setGlobalPrefix("v1");
  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",").map((v) => v.trim()),
    credentials: true,
  });
  app.enableShutdownHooks();
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen({ port, host: "0.0.0.0" });
}

bootstrap();
