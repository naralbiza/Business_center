const erros: Record<string, string> = {
  "sem-supabase": "Supabase não configurado (.env.local).",
  credenciais: "Email ou palavra-passe incorretos.",
  "nao-confirmado": "Conta ainda não confirmada. Confirme o email ou peça ao administrador para a ativar.",
  "muitas-tentativas": "Demasiadas tentativas. Aguarde um minuto e tente de novo.",
  indisponivel: "Serviço indisponível de momento. Tente novamente.",
  google: "Não foi possível entrar com o Google.",
  "google-desativado": "Login com Google ainda não ativado. Ative-o no Supabase (Authentication → Providers).",
  "nao-autorizado": "Conta sem autorização. Contacte o administrador.",
  "reset-falhou": "Não foi possível enviar o email de recuperação.",
};
const oks: Record<string, string> = {
  "reset-enviado": "Enviámos um email com o link para repor a palavra-passe.",
};

export type Notice = { tone: "erro" | "ok"; text: string } | null;
export function noticeFrom(erro?: string, ok?: string): Notice {
  if (erro) return { tone: "erro", text: erros[erro] ?? "Ocorreu um erro. Tente novamente." };
  if (ok && oks[ok]) return { tone: "ok", text: oks[ok] };
  return null;
}
