// Read-only live readiness. Does not start the worker, query customer details,
// change schema/settings or contact a messaging provider.
import { existsSync, readFileSync } from 'node:fs';
export async function run(expectedDatabase) {
  if (!expectedDatabase || process.env.AZURE_SQL_DATABASE !== expectedDatabase) throw new Error('DATABASE_CHANGED');
  const { PrismaService } = await import('file:///app/apps/api/dist/prisma/prisma.service.js');
  const db = new PrismaService();
  try {
    await db.$connect();
    const rows = await db.$queryRawUnsafe("SELECT CASE WHEN OBJECT_ID(N'dbo.OrderNotificationOutbox',N'U') IS NULL THEN 0 ELSE 1 END AS ready, HAS_PERMS_BY_NAME(N'dbo.OrderNotificationOutbox',N'OBJECT',N'SELECT') AS canRead, HAS_PERMS_BY_NAME(N'dbo.OrderNotificationOutbox',N'OBJECT',N'INSERT') AS canInsert, HAS_PERMS_BY_NAME(N'dbo.OrderNotificationOutbox',N'OBJECT',N'UPDATE') AS canUpdate");
    const value = rows[0] || {};
    const installed = existsSync('/app/apps/api/dist/order-notifications/order-notification.module.js') && readFileSync('/app/apps/api/dist/app.module.js','utf8').includes('OrderNotificationModule');
    const configured = name => Boolean(process.env[name]);
    const result = {
      readOnly: true, apiModuleInstalled: installed, queueTableExists: Number(value.ready) === 1,
      queueCapabilities: {read:Number(value.canRead)===1,insert:Number(value.canInsert)===1,update:Number(value.canUpdate)===1},
      notificationWorkerEnabled: process.env.ORDER_NOTIFICATIONS_ENABLED === 'true',
      activationCutoffConfigured: configured('ORDER_NOTIFICATIONS_START_AT'),
      whatsappEnabled: process.env.ORDER_WHATSAPP_ENABLED === 'true',
      msg91: {authConfigured:configured('MSG91_WHATSAPP_AUTHKEY') || configured('MSG91_AUTHKEY'),
        businessNumberConfigured:configured('MSG91_WHATSAPP_INTEGRATED_NUMBER'),
        prepaidTemplateConfigured:configured('MSG91_ORDER_TEMPLATE_NAME'),
        codTemplateConfigured:configured('MSG91_COD_ORDER_TEMPLATE_NAME'),
        namespaceConfigured:configured('MSG91_ORDER_TEMPLATE_NAMESPACE')},
    };
    console.log('HIDI_ORDER_READINESS::' + JSON.stringify(result));
  } finally { await db.$disconnect(); }
}
