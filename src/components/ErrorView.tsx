"use client";
import { useEffect } from "react";

// Mensagem genérica: nunca mostra o texto do erro nem detalhes técnicos ao utilizador.
export default function ErrorView({ error, retry, full = false }: { error: Error & { digest?: string }; retry: () => void; full?: boolean }) {
  useEffect(() => {
    console.error("[ui]", error.digest);
  }, [error]);
  return (
    <div className={`grid place-items-center px-6 ${full ? "min-h-screen bg-[#050914]" : "min-h-[50vh]"}`}>
      <div className="max-w-sm text-center">
        <h2 className="font-serif text-2xl text-slate-50">Algo correu mal</h2>
        <p className="mt-2 text-sm text-slate-300">Não foi possível concluir o pedido. Tente novamente dentro de instantes.</p>
        <button onClick={() => retry()} className="btn-gold mt-5 rounded-xl px-5 py-2.5 text-sm font-semibold hover:brightness-105">Tentar novamente</button>
      </div>
    </div>
  );
}
