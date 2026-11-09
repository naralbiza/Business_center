import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { PageSkeleton, ShellSkeleton } from "@/components/Skeleton";
import { getMe } from "@/lib/data";
import { requireUser } from "@/lib/supabase-server";

// A shell (sidebar + cabeçalho) só é renderizada depois de validada a sessão:
// sem sessão redireciona para /login e, entretanto, só se vê o esqueleto.
async function AuthedShell({ children }: { children: ReactNode }) {
  await connection();
  await requireUser();
  const me = await getMe();
  return (
    <div className="flex min-h-screen">
      <Sidebar unread={me?.unread ?? 0} perms={me?.perms} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header me={me} />
        <main className="flex-1 space-y-6 p-4 md:p-6"><Suspense fallback={<PageSkeleton />}>{children}</Suspense></main>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <Suspense fallback={<ShellSkeleton />}><AuthedShell>{children}</AuthedShell></Suspense>;
}
