import { Module } from "@nestjs/common";
import { DelhiveryService } from "./delhivery.service.js";

@Module({
  providers: [DelhiveryService],
  exports: [DelhiveryService],
})
export class DelhiveryModule {}
