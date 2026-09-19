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
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      try {
        const text = typeof body === "string" ? body : body.toString("utf8");
        done(null, Object.fromEntries(new URLSearchParams(text)));
      } catch (error) {
        done(error instanceof Error ? error : new Error("Invalid form body"));
      }
    },
  );

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
