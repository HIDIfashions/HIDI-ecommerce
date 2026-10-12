// Read-only check through the retained API managed identity. No identities,
// staff rows, roles, secrets or provider settings are created or changed.
export async function run(expectedDatabase) {
  if (!expectedDatabase || process.env.AZURE_SQL_DATABASE !== expectedDatabase) throw new Error('DATABASE_CHANGED');
  const { PrismaService } = await import('file:///app/apps/api/dist/prisma/prisma.service.js');
  const db = new PrismaService();
  try {
    await db.$connect();
    const staffCount = await db.adminStaff.count();
    const activeOwnerCount = await db.adminStaff.count({ where: { active: true, role: 'OWNER' } });
    const emailDeliveryConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY);
    console.log('HIDI_ADMIN_OWNER::' + JSON.stringify({ readOnly: true, staffCount, activeOwnerCount, emailDeliveryConfigured, safeToDeploy: activeOwnerCount > 0 && emailDeliveryConfigured }));
  } finally { await db.$disconnect(); }
}
