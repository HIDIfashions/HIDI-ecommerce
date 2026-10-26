// Run inside the existing authorized API container console. Read-only; no
// provider calls, worker startup, customer data, settings or schema changes.
import { existsSync, readFileSync } from 'node:fs';
export async function run(expectedDatabase) {
  if (!expectedDatabase || process.env.AZURE_SQL_DATABASE !== expectedDatabase) throw new Error('DATABASE_CHANGED');
  const { PrismaService } = await import('file:///app/apps/api/dist/prisma/prisma.service.js');
  const db = new PrismaService();
  try {
    await db.$connect();
    const tables = await db.$queryRawUnsafe(`SELECT name,
      HAS_PERMS_BY_NAME(N'dbo.' + name, N'OBJECT', N'SELECT') AS canRead,
      HAS_PERMS_BY_NAME(N'dbo.' + name, N'OBJECT', N'INSERT') AS canInsert,
      HAS_PERMS_BY_NAME(N'dbo.' + name, N'OBJECT', N'UPDATE') AS canUpdate
      FROM sys.tables WHERE name IN (N'WhatsAppMessage', N'WhatsAppConversation', N'Cart', N'CartItem')`);
    const configured = name => Boolean(process.env[name]);
    const result = { readOnly: true,
      moduleInstalled: existsSync('/app/apps/api/dist/whatsapp/msg91.service.js') &&
        existsSync('/app/apps/api/dist/whatsapp/msg91-protocol.js') &&
        readFileSync('/app/apps/api/dist/whatsapp/whatsapp.module.js', 'utf8').includes('Msg91WhatsAppService'),
      providerIsMsg91: process.env.WHATSAPP_CHATBOT_PROVIDER === 'msg91',
      enabled: process.env.WHATSAPP_CHATBOT_ENABLED === 'true',
      authConfigured: configured('MSG91_WHATSAPP_AUTHKEY') || configured('MSG91_AUTHKEY'),
      senderConfigured: /^[1-9]\d{7,14}$/.test(process.env.MSG91_WHATSAPP_INTEGRATED_NUMBER || ''),
      callbackTokenConfigured: (process.env.MSG91_WHATSAPP_WEBHOOK_TOKEN || '').length >= 32,
      cutoffConfigured: Boolean(process.env.WHATSAPP_CHATBOT_START_AT) && Number.isFinite(Date.parse(process.env.WHATSAPP_CHATBOT_START_AT)),
      testNumbersRestricted: configured('WHATSAPP_CHATBOT_TEST_NUMBERS'),
      tables: tables.map(t => ({ name: t.name, read: Number(t.canRead) === 1, insert: Number(t.canInsert) === 1, update: Number(t.canUpdate) === 1 })),
    };
    console.log('HIDI_MSG91_ORDERING_READINESS::' + JSON.stringify(result));
  } finally { await db.$disconnect(); }
}
