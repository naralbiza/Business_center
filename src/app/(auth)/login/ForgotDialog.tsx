"use client";
import { requestPasswordReset } from "@/app/actions";

export default function ForgotDialog({ onClose }: { onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Repor palavra-passe" onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <form action={requestPasswordReset} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-white/15 bg-[#0a1524] p-6 shadow-2xl">
        <h2 className="font-serif text-2xl text-slate-50">Repor palavra-passe</h2>
        <p className="text-sm text-slate-300">Indique o seu email. Enviaremos um link para definir uma nova palavra-passe.</p>
        <input name="email" type="email" required autoFocus autoComplete="email" placeholder="Email"
          className="w-full rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-[#d6b06a]/70" />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-slate-200 hover:bg-white/5">Cancelar</button>
          <button className="btn-gold rounded-xl px-4 py-2.5 text-sm font-semibold hover:brightness-105">Enviar link</button>
        </div>
      </form>
    </div>
  );
}
