import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/auth/session";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  return (
    <AppShell role={session.role} userName={session.name}>
      {children}
    </AppShell>
  );
}
