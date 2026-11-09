import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#050914] px-6">
      <div className="max-w-sm text-center">
        <h1 className="font-serif text-3xl text-slate-50">Página não encontrada</h1>
        <p className="mt-2 text-sm text-slate-300">O endereço que procura não existe ou foi movido.</p>
        <Link href="/" className="btn-gold mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-semibold hover:brightness-105">Voltar ao início</Link>
      </div>
    </main>
  );
}
