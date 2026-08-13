import type { DefaultSession } from "next-auth";
import type { User } from "@/lib/types";

declare module "next-auth" {
  interface Session extends DefaultSession {
    appAccessToken?: string;
    appUser?: User;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    appAccessToken?: string;
    appUser?: User;
  }
}
