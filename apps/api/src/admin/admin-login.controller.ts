import { Body, Controller, Delete, Headers, HttpCode, Post } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveAdminSession, revokeAdminSession, verifyAdminCode } from './admin-session.js';

@Controller('auth/admin')
export class AdminLoginController {
  constructor(private readonly db: PrismaService, private readonly auth: AdminAuthService) {}
  @Post('otp/verify') @HttpCode(200)
  verify(@Body() body: unknown) { return verifyAdminCode(this.db,this.auth,body); }
  @Post('activity') @HttpCode(200)
  async activity(@Headers('authorization') authorization?: string) {
    return {ok:true,admin:await resolveAdminSession(this.db,authorization,true),idleTimeoutSeconds:3600};
  }
  @Delete('session')
  logout(@Headers('authorization') authorization?: string) { return revokeAdminSession(this.db,authorization); }
}
