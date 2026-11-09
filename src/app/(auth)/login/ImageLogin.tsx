"use client";
import { useState } from "react";
import Image from "next/image";
import { signIn } from "@/app/actions";
import ForgotDialog from "./ForgotDialog";
import type { Notice } from "./messages";

// A arte (public/login.png) tem 1672×941. Os campos reais são posicionados por cima, em coordenadas da própria imagem.
const W = 1672, H = 941, FIELD = "#0a1524", PANEL = "#06111d";
const box = (x1: number, y1: number, x2: number, y2: number) => ({
  position: "absolute" as const,
  left: `${(x1 / W) * 100}%`, top: `${(y1 / H) * 100}%`,
  width: `${((x2 - x1) / W) * 100}%`, height: `${((y2 - y1) / H) * 100}%`,
});
const fs = (px: number) => `${(px / W) * 100}cqw`;

export default function ImageLogin({ notice }: { notice: Notice }) {
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [forgot, setForgot] = useState(false);
  const inputCls = "h-full w-full bg-transparent text-slate-100 outline-none placeholder:text-slate-400";
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#050914]">
      {/* A arte cobre sempre o ecrã (como background-size: cover), ancorada à direita onde está o formulário. */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2"
        style={{ width: "max(100vw, calc(100vh * 1672 / 941))", aspectRatio: `${W} / ${H}`, containerType: "inline-size" }}>
        <Image src="/login.png" alt="Business Center Esperança" fill priority sizes="100vw" className="select-none" />

        <form action={signIn} className="absolute inset-0">
          <div style={{ ...box(1214, 478, 1560, 522), background: FIELD, fontSize: fs(15.5) }}>
            <input name="email" type="text" required autoComplete="username" placeholder="Email ou nome de utilizador" className={inputCls} />
          </div>

          <div style={{ ...box(1214, 546, 1560, 590), background: FIELD, fontSize: fs(15.5) }}>
            <input name="password" type={show ? "text" : "password"} required autoComplete="current-password" placeholder="Palavra-passe" className={inputCls} />
          </div>
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
            className="grid cursor-pointer place-items-center text-slate-200" style={{ ...box(1562, 548, 1604, 588), background: FIELD }}>
            <svg viewBox="0 0 24 24" className="w-[55%]" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
              {!show && <path d="M4 4l16 16" />}
            </svg>
          </button>

          <label className="cursor-pointer" style={box(1155, 614, 1330, 638)}>
            <input type="checkbox" name="remember" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="sr-only" />
            <span aria-hidden className="absolute grid place-items-center" style={{ left: 0, top: "8%", width: "10.5%", height: "84%", background: FIELD, border: "1.5px solid #8a94a6", borderRadius: "18%" }}>
              {remember && <svg viewBox="0 0 24 24" className="w-[80%]" fill="none" stroke="#d6b06a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}
            </span>
          </label>

          <button type="button" onClick={() => setForgot(true)} aria-label="Esqueceu-se da palavra-passe?"
            className="cursor-pointer" style={box(1410, 612, 1618, 640)} />

          {notice && (
            <p className={`text-center ${notice.tone === "erro" ? "text-red-400" : "text-emerald-400"}`} style={{ ...box(1155, 637, 1615, 658), fontSize: fs(12.5), lineHeight: 1.6 }}>
              {notice.text}
            </p>
          )}

          <button type="submit" aria-label="Entrar" className="cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-[#d6b06a]" style={box(1155, 658, 1615, 721)} />

          {/* Cobre o "ou continue com" e os botões Google/Microsoft desenhados na arte. */}
          <div style={{ ...box(1148, 736, 1625, 842), background: PANEL }} />
        </form>
      </div>
      {forgot && <ForgotDialog onClose={() => setForgot(false)} />}
    </div>
  );
}
