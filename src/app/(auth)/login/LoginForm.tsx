"use client";
import { useState } from "react";
import { signIn } from "@/app/actions";
import ForgotDialog from "./ForgotDialog";
import type { Notice } from "./messages";

const field = "flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3.5 focus-within:border-[#d6b06a]/70";
const input = "w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-400";

export default function LoginForm({ notice }: { notice: Notice }) {
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  return (
    <>
      <form action={signIn} className="mt-6 space-y-3.5">
        <label className={field}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-slate-300" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
          <input name="email" type="text" required autoComplete="username" placeholder="Email ou nome de utilizador" className={input} />
        </label>
        <label className={field}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-slate-300" aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3M12 15v2" /></svg>
          <input name="password" type={show ? "text" : "password"} required autoComplete="current-password" placeholder="Palavra-passe" className={input} />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Ocultar palavra-passe" : "Mostrar palavra-passe"} className="shrink-0 text-slate-300 hover:text-slate-50">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
              {!show && <path d="M4 4l16 16" />}
            </svg>
          </button>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-slate-200">
            <input type="checkbox" name="remember" className="size-4 rounded border-white/30 bg-transparent accent-[#d6b06a]" />
            Manter sessão iniciada
          </label>
          <button type="button" onClick={() => setForgot(true)} className="text-[#d6b06a] hover:underline">Esqueceu-se da palavra-passe?</button>
        </div>

        {notice && <p className={`text-sm ${notice.tone === "erro" ? "text-red-400" : "text-emerald-400"}`}>{notice.text}</p>}

        <button className="btn-gold flex w-full items-center justify-center gap-4 rounded-xl py-3.5 text-lg font-semibold shadow-[0_8px_30px_-8px_rgba(214,176,106,0.6)] hover:brightness-105">
          Entrar
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12h16M14 6l6 6-6 6" /></svg>
        </button>
      </form>
      {forgot && <ForgotDialog onClose={() => setForgot(false)} />}
    </>
  );
}
