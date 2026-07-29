import type { NextAuthConfig, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";

export function jwtCallback({ token, user }: { token: JWT; user?: User }): JWT {
  if (user) {
    token.id = user.id as string;
    token.role = user.role;
  }
  return token;
}

export function sessionCallback({
  session,
  token,
}: {
  session: Session;
  token: JWT;
}): Session {
  if (session.user) {
    session.user.id = token.id;
    session.user.role = token.role;
  }
  return session;
}

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    jwt: jwtCallback,
    session: sessionCallback,
  },
} satisfies NextAuthConfig;
