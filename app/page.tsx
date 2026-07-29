import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { dashboardPathForRole } from "@/lib/permissions";

export default async function Home() {
  const session = await auth();

  if (session?.user?.role) {
    redirect(dashboardPathForRole(session.user.role));
  }

  redirect("/login");
}
