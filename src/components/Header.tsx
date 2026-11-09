import Link from "next/link";
import type { Me } from "@/lib/data";
import { Bell, Chat } from "./icons";
import SearchBox from "./SearchBox";
import UserMenu from "./UserMenu";

// Barra superior translúcida: no dashboard fica por cima da imagem de abertura.
export default function Header({ me }: { me: Me | null }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-white/5 bg-[#020b13]/55 pl-14 pr-4 backdrop-blur-md md:px-6">
      <SearchBox />
      {me && (
        <>
          <Link href="/notificacoes" className="relative rounded-xl p-2 text-slate-200 transition-colors hover:bg-white/5 hover:text-white" aria-label="Notificações">
            <Bell className="size-[22px]" />
            {me.unread > 0 && <span className="absolute right-0 top-0 grid min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold leading-[18px] text-white">{me.unread}</span>}
          </Link>
          <Link href="/notificacoes" className="rounded-xl p-2 text-slate-200 transition-colors hover:bg-white/5 hover:text-white" aria-label="Mensagens"><Chat className="size-[22px]" /></Link>
          <UserMenu name={me.name} role={me.role} />
        </>
      )}
    </header>
  );
}
