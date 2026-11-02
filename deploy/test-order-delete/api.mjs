import 'reflect-metadata';
import {Module,Controller,Get,Post,Query,Param,Body,UseGuards,Inject,HttpException} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service.js';
import {AdminGuard,CurrentAdmin} from './admin-auth.js';
import {AdminSecurityModule} from './admin-security.module.js';
import {createStore} from './test-order-store.mjs';
export class TestOrderController{
 constructor(db){this.store=createStore(db);}
 async run(fn){try{return await fn();}catch(e){if(e.status)throw new HttpException(e.message,e.status);throw e;}}
 list(query,actor){return this.run(()=>this.store.list(query,actor));}
 lookup(key,actor){return this.run(()=>this.store.lookup(key,actor));}
 action(key,input,actor){return this.run(()=>this.store.action(key,input,actor));}
}
Inject(PrismaService)(TestOrderController,undefined,0);Controller('admin/test-orders')(TestOrderController);UseGuards(AdminGuard)(TestOrderController);
for(const [name,verb,path]of [['list',Get,''],['lookup',Get,':number'],['action',Post,':number']])verb(path)(TestOrderController.prototype,name,Object.getOwnPropertyDescriptor(TestOrderController.prototype,name));
Query()(TestOrderController.prototype,'list',0);CurrentAdmin()(TestOrderController.prototype,'list',1);
Param('number')(TestOrderController.prototype,'lookup',0);CurrentAdmin()(TestOrderController.prototype,'lookup',1);
Param('number')(TestOrderController.prototype,'action',0);Body()(TestOrderController.prototype,'action',1);CurrentAdmin()(TestOrderController.prototype,'action',2);
export class TestOrdersModule{}
Module({imports:[AdminSecurityModule],controllers:[TestOrderController]})(TestOrdersModule);
