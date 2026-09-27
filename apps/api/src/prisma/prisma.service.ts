import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "../generated/prisma/client.js";

function createAdapter() {
  const server = process.env.AZURE_SQL_SERVER;
  const database = process.env.AZURE_SQL_DATABASE;
  if (!server || !database) throw new Error("AZURE_SQL_SERVER and AZURE_SQL_DATABASE are required");
  const requested = Number(process.env.DATABASE_POOL_MAX ?? "10");
  const max = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 30) : 10;
  return new PrismaMssql({
    server,
    database,
    port: 1433,
    authentication: {
      type: "azure-active-directory-default",
      options: process.env.AZURE_CLIENT_ID ? { clientId: process.env.AZURE_CLIENT_ID } : {},
    },
    options: { encrypt: true, trustServerCertificate: false },
    pool: { max, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 15000,
    requestTimeout: 30000,
  }, { schema: "dbo" });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() { super({ adapter: createAdapter() }); }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
