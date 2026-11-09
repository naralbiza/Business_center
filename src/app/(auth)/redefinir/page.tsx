import { Suspense } from "react";
import { updatePassword } from "@/app/actions";

const input = "w-full rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3.5 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-[#d6b06a]/70";

async function RedefinirContent({ searchParams }: Pick<PageProps<"/redefinir">, "searchParams">) {
  const { erro } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-[#050914] px-6 py-10">
      <form action={updatePassword} className="w-full max-w-[420px] space-y-4">
        <div className="text-center">
          <div className="text-[11px] tracking-[0.4em] text-slate-200">BUSINESS CENTER</div>
          <div className="font-serif text-4xl tracking-[0.12em] text-[#d6b06a]">ESPERANÇA</div>
        </div>
        <h1 className="pt-4 text-center font-serif text-3xl text-slate-50">Nova palavra-passe</h1>
        <p className="text-center text-sm text-slate-300">Escolha uma palavra-passe com pelo menos 8 caracteres.</p>
        <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="Nova palavra-passe" className={input} />
        <input name="confirm" type="password" required minLength={8} autoComplete="new-password" placeholder="Confirmar palavra-passe" className={input} />
        {erro && <p className="text-sm text-red-400">{erro === "invalida" ? "As palavras-passe não coincidem ou são curtas demais." : "Não foi possível atualizar. Peça um novo link."}</p>}
        <button className="btn-gold w-full rounded-xl py-3.5 text-lg font-semibold hover:brightness-105">Guardar</button>
      </form>
    </main>
  );
}

export default function Redefinir({ searchParams }: PageProps<"/redefinir">) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050914]" />}>
      <RedefinirContent searchParams={searchParams} />
    </Suspense>
  );
}
