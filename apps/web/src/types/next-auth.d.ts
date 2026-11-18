import type { Role } from "@/lib/auth";

declare module "next-auth" {
  interface User {
    role: Role;
    sid: string;
  }
  interface Session {
    user: { name: string; role: Role };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sid?: string;
    role?: Role;
  }
}
