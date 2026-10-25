import { Module } from "@nestjs/common";
import { DelhiveryService } from "./delhivery.service.js";
import { DelhiverySyncService } from "./delhivery-sync.service.js";

@Module({
  providers: [DelhiveryService, DelhiverySyncService],
  exports: [DelhiveryService],
})
export class DelhiveryModule {}
