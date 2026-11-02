from pathlib import Path
HERE=Path(__file__).resolve().parent
def once(s,a,b):
    assert s.count(a)==1,'Unrecognized retained hook: '+a
    return s.replace(a,b,1)
def patch_runtime(base,overlay,app):
    base,overlay=Path(base),Path(overlay);allowed=[]
    def put(path,text):
        p=overlay/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,encoding='utf-8');allowed.append(path)
    if app=='api':
        folder='apps/api/dist/admin/'
        for source,target in [('policy.mjs','test-order-policy.mjs'),('store.mjs','test-order-store.mjs'),('api.mjs','test-orders.module.mjs')]:
            assert not (base/folder/target).exists(),'Feature already installed; review update separately'
            put(folder+target,(HERE/source).read_text().replace("from './policy.mjs'","from './test-order-policy.mjs'"))
        path='apps/api/dist/app.module.js';s=(base/path).read_text();s='import { TestOrdersModule } from "./admin/test-orders.module.mjs";\n'+s;put(path,once(s,'imports: [','imports: [TestOrdersModule, '))
        path=folder+'admin.service.js';s=(base/path).read_text();s='import { deletedTestOrderIds } from "./test-order-store.mjs";\n'+s
        start=s.index('async listOrders(');end=s.index('async getOrder(',start);part=s[start:end]
        part=once(part,'where: {','where: { id: { notIn: await deletedTestOrderIds(this.prisma) },')
        put(path,s[:start]+part+s[end:])
        path=folder+'admin-dashboard.controller.js';s=(base/path).read_text();s='import { deletedTestOrderIds } from "./test-order-store.mjs";\n'+s
        s=once(s,'const where = { ...orderSearch,','const where = { id: { notIn: await deletedTestOrderIds(this.db) }, ...orderSearch,')
        s=once(s,'canReadOrders ? this.db.order.findMany({ where: { OR:','canReadOrders ? this.db.order.findMany({ where: { id: { notIn: await deletedTestOrderIds(this.db) }, OR:')
        put(path,s)
    else:
        path='server.mjs';s=(base/path).read_text();assert 'createTestOrdersHandler' not in s
        s='import { createTestOrdersHandler } from "./test-orders/handler.mjs";\n'+s
        s=once(s,'const handleAdminSecurity = createAdminSecurityHandler();','const handleAdminSecurity = createAdminSecurityHandler();\nconst handleTestOrders = createTestOrdersHandler();')
        s=once(s,'  if (await handleAdminSecurity(request, response, pathname)) return;','  if (await handleTestOrders(request, response, pathname)) return;\n  if (await handleAdminSecurity(request, response, pathname)) return;');put(path,s)
        path='admin-security/activity.mjs';put(path,(base/path).read_text()+'\n'+(HERE/'navigation.mjs').read_text())
        for name in ['handler.mjs','index.html','app.mjs','style.css']:put('test-orders/'+name,(HERE/name).read_text())
    return {'passed':True,'allowedFiles':sorted(allowed),'metadataOnly':True,'noSchemaChange':True,'businessWritersUnchanged':True}
