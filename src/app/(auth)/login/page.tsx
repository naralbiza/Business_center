import { Suspense } from "react";
import LoginForm from "./LoginForm";
import ImageLogin from "./ImageLogin";
import { noticeFrom } from "./messages";

const gold = "text-[#d6b06a]";

function Logo({ className = "", big = false }: { className?: string; big?: boolean }) {
  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      <svg viewBox="0 0 120 80" className={`${big ? "w-28" : "w-24"} ${gold}`} fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
        <path d="M14 74V36h14v38M34 74V20h16v54M56 74V8l22 6v60M84 74V30h-6M6 76h108" />
        <path d="M20 44v4M20 54v4M40 30v4M40 42v4M40 54v4M64 22v4M64 34v4M64 46v4" strokeWidth="2" />
      </svg>
      <div className="mt-2 text-[13px] tracking-[0.42em] text-slate-100">BUSINESS CENTER</div>
      <div className={`font-serif text-[42px] leading-tight tracking-[0.12em] ${gold}`}>ESPERANÇA</div>
      <div className="text-[10px] tracking-[0.45em] text-slate-200">CENTRO EMPRESARIAL</div>
      <div className="mt-3 h-px w-3/4 bg-gradient-to-r from-transparent via-[#d6b06a] to-transparent" />
    </div>
  );
}

async function LoginContent({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { erro, ok } = await searchParams;
  const notice = noticeFrom(erro as string | undefined, ok as string | undefined);
  return (
    <>
      {/* Desktop: a arte completa do design, com os campos reais por cima. */}
      <div className="hidden lg:block"><ImageLogin notice={notice} /></div>

      {/* Telemóvel/tablet: formulário simples. */}
      <main className="grid min-h-screen place-items-center bg-[#050914] px-6 py-10 lg:hidden">
        <div className="w-full max-w-[460px]">
          <Logo className="mx-auto" />
          <h1 className="mt-7 text-center font-serif text-[40px] leading-none text-slate-50">Bem-vindo</h1>
          <p className="mx-auto mt-3 max-w-sm text-center text-[15px] leading-snug text-slate-100">
            Aceda à sua conta para gerir escritórios, contratos, eventos e operações.
          </p>
          <LoginForm notice={notice} />
        </div>
      </main>
    </>
  );
}

export default function Login({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050914]" />}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
