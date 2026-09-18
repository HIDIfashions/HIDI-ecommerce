import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  phone?: string | null;
  phone_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export type VerifiedAuthUser = {
  id: string;
  email: string;
  metadata: Record<string, unknown>;
  phone?: string | null;
  phoneVerified?: boolean;
};

@Injectable()
export class SupabaseAuthService {
  async requireUser(authorization?: string): Promise<VerifiedAuthUser> {
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Sign in is required");
    }

    const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!url || !publishableKey) {
      throw new ServiceUnavailableException("Customer authentication is not configured");
    }

    const response = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: publishableKey,
        Authorization: authorization,
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException("Your sign-in session has expired. Please sign in again.");
    }

    const user = await response.json() as SupabaseAuthUser;
    const email = user.email?.trim().toLowerCase();

    if (!user.id || !email || !user.email_confirmed_at) {
      throw new UnauthorizedException("A verified email address is required");
    }

    return {
      id: user.id,
      email,
      metadata: user.user_metadata ?? {},
      phone: user.phone_confirmed_at ? user.phone ?? null : null,
      phoneVerified: Boolean(user.phone && user.phone_confirmed_at),
    };
  }

  async optionalUser(authorization?: string): Promise<VerifiedAuthUser | null> {
    if (!authorization?.startsWith("Bearer ")) return null;
    return this.requireUser(authorization);
  }
}
