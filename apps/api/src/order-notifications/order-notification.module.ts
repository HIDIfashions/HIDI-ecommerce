import { Module } from "@nestjs/common";
import { OrderNotificationController } from "./order-notification.controller.js";
import { OrderNotificationService } from "./order-notification.service.js";
import { OrderNotificationStore } from "./order-notification.store.js";
import { OrderNotificationSender } from "./order-notification.sender.js";
@Module({ controllers: [OrderNotificationController], providers: [OrderNotificationService, OrderNotificationStore, OrderNotificationSender] })
export class OrderNotificationModule {}
