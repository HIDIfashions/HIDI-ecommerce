// Read-only live readiness. Does not start the worker, query customer details,
// change schema/settings or contact a messaging provider.
import { existsSync, readFileSync } from 'node:fs';
export function smsConstraintReady(value, migrationVerified) {
  if (!value || value.is_disabled || value.is_not_trusted) return false;
  return typeof value.definition === 'string' ? value.definition.includes("'SMS'") : value.definition === null && migrationVerified === true;
}
export async function run(expectedDatabase, migrationVerified = false) {
  if (!expectedDatabase || process.env.AZURE_SQL_DATABASE !== expectedDatabase) throw new Error('DATABASE_CHANGED');
  const { PrismaService } = await import('file:///app/apps/api/dist/prisma/prisma.service.js');
  const db = new PrismaService();
  try {
    await db.$connect();
    const rows = await db.$queryRawUnsafe("SELECT CASE WHEN OBJECT_ID(N'dbo.OrderNotificationOutbox',N'U') IS NULL THEN 0 ELSE 1 END AS ready, HAS_PERMS_BY_NAME(N'dbo.OrderNotificationOutbox',N'OBJECT',N'SELECT') AS canRead, HAS_PERMS_BY_NAME(N'dbo.OrderNotificationOutbox',N'OBJECT',N'INSERT') AS canInsert, HAS_PERMS_BY_NAME(N'dbo.OrderNotificationOutbox',N'OBJECT',N'UPDATE') AS canUpdate");
    const value = rows[0] || {};
    const installed = existsSync('/app/apps/api/dist/order-notifications/order-notification.module.js') && readFileSync('/app/apps/api/dist/app.module.js','utf8').includes('OrderNotificationModule');
    const configured = name => Boolean(process.env[name]);
    const smsFile = '/app/apps/api/dist/order-notifications/order-notification.service.js';
    const smsInstalled = existsSync(smsFile) && readFileSync(smsFile,'utf8').includes('ORDER_SMS_START_AT');
    const smsConstraints = await db.$queryRawUnsafe("SELECT definition,is_disabled,is_not_trusted FROM sys.check_constraints WHERE name=N'OrderNotificationOutbox_channel_check' AND parent_object_id=OBJECT_ID(N'dbo.OrderNotificationOutbox')");
    const smsConstraint = smsConstraints[0];
    const result = {
      readOnly: true, apiModuleInstalled: installed, queueTableExists: Number(value.ready) === 1,
      queueCapabilities: {read:Number(value.canRead)===1,insert:Number(value.canInsert)===1,update:Number(value.canUpdate)===1},
      notificationWorkerEnabled: process.env.ORDER_NOTIFICATIONS_ENABLED === 'true',
      activationCutoffConfigured: configured('ORDER_NOTIFICATIONS_START_AT'),
      whatsappEnabled: process.env.ORDER_WHATSAPP_ENABLED === 'true',
      sms: {moduleInstalled:smsInstalled, schemaReady:smsConstraintReady(smsConstraint,migrationVerified), constraintDefinitionVisible:typeof smsConstraint?.definition==='string',
        authConfigured:configured('MSG91_SMS_AUTHKEY') || configured('MSG91_AUTHKEY'), enabled:process.env.ORDER_SMS_ENABLED==='true',
        providerVerified:process.env.ORDER_SMS_PROVIDER_VERIFIED==='true', cutoffConfigured:configured('ORDER_SMS_START_AT'),
        templateConfigured:process.env.MSG91_ORDER_SMS_TEMPLATE_ID==='6ad3197ba8dca687a20f1e62', emailEnabled:process.env.ORDER_EMAIL_ENABLED!=='false'},
      msg91: {authConfigured:configured('MSG91_WHATSAPP_AUTHKEY') || configured('MSG91_AUTHKEY'),
        businessNumberConfigured:configured('MSG91_WHATSAPP_INTEGRATED_NUMBER'),
        prepaidTemplateConfigured:configured('MSG91_ORDER_TEMPLATE_NAME'),
        codTemplateConfigured:configured('MSG91_COD_ORDER_TEMPLATE_NAME'),
        namespaceConfigured:configured('MSG91_ORDER_TEMPLATE_NAMESPACE')},
    };
    console.log('HIDI_ORDER_READINESS::' + JSON.stringify(result));
  } finally { await db.$disconnect(); }
}
