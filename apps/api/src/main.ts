import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true, trustProxy: true, bodyLimit: 1024 * 1024 }),
    { rawBody: true },
  );
  if (process.env.MIGRATION_READ_ONLY === "true") {
    app.getHttpAdapter().getInstance().addHook("onRequest", async (request: { method: string; url: string }, reply: any) => {
      const isPublicRead = ["GET", "HEAD"].includes(request.method) && /^\/v1\/(health|products|reviews\/products)(\/|\?|$)/.test(request.url);
      if (!isPublicRead && request.method !== "OPTIONS") {
        return reply.code(503).header("Cache-Control", "no-store").send({ message: "This preview is available for catalogue viewing only." });
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

