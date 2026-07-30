import { auth } from "@/auth";
import type { Session } from "next-auth";
import type { Role } from "@prisma/client";

const DASHBOARD_PATH_BY_ROLE: Record<Role, string> = {
  ADMIN: "/admin",
  MANAGER: "/manager",
  TEACHER: "/teacher",
  STUDENT: "/student",
};

export function dashboardPathForRole(role: Role): string {
  return DASHBOARD_PATH_BY_ROLE[role];
}

export function isPathAllowedForRole(pathname: string, role: Role): boolean {
  const base = dashboardPathForRole(role);
  return pathname === base || pathname.startsWith(base + "/");
}

export async function requireRole(allowedRoles: Role[]): Promise<Session> {
  const session = await auth();
  if (!session?.user?.role || !allowedRoles.includes(session.user.role)) {
    throw new Error("Unauthorized");
  }
  return session;
}
