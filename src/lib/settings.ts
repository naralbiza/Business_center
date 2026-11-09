// Definição das secções de configuração (usada pela página e validada nas acções)
export type FieldType = "text" | "email" | "tel" | "number" | "select" | "toggle";
export interface Field { key: string; label: string; type: FieldType; options?: [string, string][]; hint?: string; required?: boolean; span?: 1 | 2; def: string | boolean }
export interface Group { title: string; subtitle?: string; layout?: "grid" | "toggles"; fields: Field[] }
export interface Section { id: string; title: string; subtitle: string; heading: string; description: string; icon: string; groups: Group[] }

const sn = (): [string, string][] => [["sim", "Sim"], ["nao", "Não"]];

export const SECTIONS: Section[] = [
  { id: "geral", title: "Geral", subtitle: "Informações da empresa e preferências do sistema", heading: "Informações do Sistema", description: "Defina as preferências principais do Business Center Esperança.", icon: "gear", groups: [
    { title: "Identificação", subtitle: "Informações básicas sobre o sistema e empresa.", fields: [
      { key: "nome", label: "Nome do Sistema", type: "text", required: true, def: "Business Center Esperança" },
      { key: "sigla", label: "Nome Curto / Sigla", type: "text", def: "BCE" },
    ] },
    { title: "Contacto e Localização", subtitle: "Dados de contacto e localização principal.", fields: [
      { key: "email", label: "Email Principal", type: "email", required: true, def: "geral@esperanca.co.ao" },
      { key: "endereco", label: "Endereço", type: "text", def: "Avenida Principal, Namibe, Angola" },
      { key: "telefone", label: "Telefone", type: "tel", def: "+244 923 456 789" },
      { key: "fuso", label: "Fuso Horário", type: "select", options: [["Africa/Luanda", "(GMT+01:00) Luanda"], ["Europe/Lisbon", "(GMT+00:00) Lisboa"], ["UTC", "UTC"]], def: "Africa/Luanda" },
    ] },
    { title: "Idioma e Formato", subtitle: "Defina como os dados são apresentados no sistema.", fields: [
      { key: "idioma", label: "Idioma", type: "select", options: [["pt-AO", "Português (Angola)"], ["pt-PT", "Português (Portugal)"], ["en", "English"]], def: "pt-AO" },
      { key: "data", label: "Formato de Data", type: "select", options: [["DD/MM/AAAA", "DD/MM/AAAA (31/12/2026)"], ["AAAA-MM-DD", "AAAA-MM-DD (2026-12-31)"]], def: "DD/MM/AAAA" },
      { key: "hora", label: "Formato de Hora", type: "select", options: [["24", "24 horas (14:30)"], ["12", "12 horas (2:30 PM)"]], def: "24" },
      { key: "moeda", label: "Moeda", type: "select", options: [["AOA", "Kwanza (Kz)"], ["USD", "Dólar (US$)"], ["EUR", "Euro (€)"]], def: "AOA" },
    ] },
    { title: "Preferências do Sistema", subtitle: "Comportamento geral e funcionalidades.", layout: "toggles", fields: [
      { key: "multi", label: "Activar multi-empresas", hint: "Permite gerir várias empresas no mesmo sistema.", type: "toggle", def: true },
      { key: "registo", label: "Activar registo de actividade", hint: "Mantém histórico de acções importantes.", type: "toggle", def: true },
      { key: "manutencao", label: "Modo de manutenção", hint: "Impede o acesso de utilizadores temporariamente.", type: "toggle", def: false },
      { key: "relatorio", label: "Receber relatório diário por email", hint: "Resumo das principais actividades do sistema.", type: "toggle", def: true },
    ] },
  ] },
  { id: "empresa", title: "Perfil da Empresa", subtitle: "Identidade, contacto e documentação", heading: "Perfil da Empresa", description: "Dados legais e de contacto usados em contratos e faturas.", icon: "building", groups: [
    { title: "Dados legais", fields: [
      { key: "razao", label: "Denominação social", type: "text", def: "Business Center Esperança, Lda." },
      { key: "nif", label: "NIF", type: "text", def: "" },
      { key: "alvara", label: "Alvará / Registo comercial", type: "text", def: "" },
      { key: "website", label: "Website", type: "text", def: "" },
    ] },
    { title: "Contacto comercial", fields: [
      { key: "email", label: "Email comercial", type: "email", def: "" },
      { key: "telefone", label: "Telefone", type: "tel", def: "" },
      { key: "morada", label: "Morada fiscal", type: "text", span: 2, def: "" },
    ] },
  ] },
  { id: "faturacao", title: "Facturação e Impostos", subtitle: "Moeda, impostos e séries de documentos", heading: "Facturação e Impostos", description: "Parâmetros usados na emissão de faturas e no cálculo de impostos.", icon: "receipt", groups: [
    { title: "Impostos", fields: [
      { key: "iva", label: "Taxa de IVA (%)", type: "number", def: "14" },
      { key: "retencao", label: "Retenção na fonte (%)", type: "number", def: "6.5" },
      { key: "iva_incluido", label: "Preços incluem IVA", type: "select", options: sn(), def: "nao" },
    ] },
    { title: "Séries e prazos", fields: [
      { key: "serie", label: "Prefixo das faturas", type: "text", def: "FT" },
      { key: "vencimento", label: "Dias para vencimento", type: "number", def: "30" },
      { key: "alerta", label: "Alertar vencimento com (dias)", type: "number", def: "7" },
    ] },
  ] },
  { id: "notificacoes", title: "Notificações", subtitle: "Canais, alertas e preferências", heading: "Notificações", description: "Escolha o que o sistema comunica e por que canal.", icon: "bell", groups: [
    { title: "Alertas", subtitle: "Eventos que geram notificação.", layout: "toggles", fields: [
      { key: "contratos", label: "Contratos a expirar", hint: "Avisa 60, 30 e 7 dias antes do fim.", type: "toggle", def: true },
      { key: "pagamentos", label: "Pagamentos em atraso", hint: "Avisa diariamente enquanto estiver em atraso.", type: "toggle", def: true },
      { key: "impostos", label: "Impostos a vencer", hint: "Lembra as obrigações fiscais.", type: "toggle", def: true },
      { key: "eventos", label: "Novas reservas de eventos", type: "toggle", def: true },
      { key: "stock", label: "Stock baixo", type: "toggle", def: true },
    ] },
    { title: "Canais", layout: "toggles", fields: [
      { key: "email", label: "Enviar também por email", type: "toggle", def: true },
      { key: "resumo", label: "Resumo semanal", hint: "Enviado à segunda-feira de manhã.", type: "toggle", def: false },
    ] },
  ] },
  { id: "seguranca", title: "Segurança", subtitle: "Autenticação, sessões e políticas de acesso", heading: "Segurança", description: "Políticas de acesso e de sessão aplicadas a todos os utilizadores.", icon: "shield", groups: [
    { title: "Sessões e palavras-passe", fields: [
      { key: "sessao", label: "Duração da sessão (horas)", type: "number", def: "12" },
      { key: "minimo", label: "Tamanho mínimo da palavra-passe", type: "number", def: "8" },
      { key: "tentativas", label: "Tentativas antes de bloquear", type: "number", def: "5" },
    ] },
    { title: "Políticas", layout: "toggles", fields: [
      { key: "mfa", label: "Exigir verificação em dois passos", hint: "Para contas administrativas.", type: "toggle", def: false },
      { key: "bloqueio", label: "Bloquear após tentativas falhadas", type: "toggle", def: true },
    ] },
  ] },
  { id: "aparencia", title: "Aparência", subtitle: "Tema, cores e personalização visual", heading: "Aparência", description: "Personalize o aspecto da interface.", icon: "sun", groups: [
    { title: "Tema", fields: [
      { key: "tema", label: "Tema", type: "select", options: [["escuro", "Escuro (premium)"], ["claro", "Claro"], ["auto", "Automático"]], def: "escuro" },
      { key: "densidade", label: "Densidade", type: "select", options: [["confortavel", "Confortável"], ["compacta", "Compacta"]], def: "confortavel" },
    ] },
  ] },
  { id: "integracoes", title: "Integrações", subtitle: "Serviços externos e APIs", heading: "Integrações", description: "Ligações a serviços externos. As chaves sensíveis ficam no servidor.", icon: "list", groups: [
    { title: "Serviços", layout: "toggles", fields: [
      { key: "google", label: "Início de sessão com Google", hint: "Requer o fornecedor activo no Supabase.", type: "toggle", def: false },
      { key: "smtp", label: "Envio de email (SMTP)", hint: "Necessário para notificações por email.", type: "toggle", def: false },
      { key: "webhooks", label: "Webhooks", type: "toggle", def: false },
    ] },
  ] },
  { id: "backup", title: "Backup e Dados", subtitle: "Cópias de segurança e exportação", heading: "Backup e Dados", description: "Política de retenção e exportação dos dados.", icon: "folder", groups: [
    { title: "Cópias de segurança", fields: [
      { key: "frequencia", label: "Frequência", type: "select", options: [["diaria", "Diária"], ["semanal", "Semanal"], ["mensal", "Mensal"]], def: "diaria" },
      { key: "retencao", label: "Retenção (dias)", type: "number", def: "30" },
    ] },
  ] },
  { id: "avancadas", title: "Configurações Avançadas", subtitle: "Parâmetros técnicos do sistema", heading: "Configurações Avançadas", description: "Parâmetros técnicos. Altere apenas se souber o impacto.", icon: "wrench", groups: [
    { title: "Sistema", fields: [
      { key: "paginacao", label: "Itens por página", type: "number", def: "25" },
      { key: "cache", label: "Tempo de cache (minutos)", type: "number", def: "5" },
    ] },
    { title: "Depuração", layout: "toggles", fields: [
      { key: "logs", label: "Registo detalhado de erros", hint: "Guarda mais informação nos registos do servidor.", type: "toggle", def: false },
    ] },
  ] },
];

export const sectionDefaults = (s: Section) => Object.fromEntries(s.groups.flatMap((g) => g.fields.map((f) => [f.key, f.def])));
