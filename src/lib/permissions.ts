// Módulos e níveis de acesso. O backend (RLS) aplica as mesmas regras; isto serve para mostrar/ocultar na interface.
export const MODULES = [
  ["dashboard", "Dashboard"], ["escritorios", "Escritórios"], ["empresas", "Empresas"], ["contratos", "Contratos"], ["financeiro", "Financeiro"],
  ["eventos", "Eventos e Reservas"], ["restaurante", "Restaurante"], ["operacoes", "Operações"], ["rh", "Recursos Humanos"],
  ["relatorios", "Relatórios e Analytics"], ["administracao", "Administração"],
] as const;
export type ModuleKey = (typeof MODULES)[number][0];
export const LEVELS = [[0, "Sem acesso"], [1, "Ver"], [2, "Editar"], [3, "Acesso total"]] as const;

export const ROLES: [string, string, string][] = [
  ["super_admin", "Super Admin", "Acesso total ao sistema"],
  ["administrador", "Administrador", "Gestão administrativa"],
  ["financeiro", "Financeiro", "Gestão financeira e impostos"],
  ["eventos", "Gestor de Eventos", "Gestão de eventos e reservas"],
  ["restaurante", "Gestor de Restaurante", "Gestão do restaurante"],
  ["operacoes", "Gestor de Operações", "Operações e manutenção"],
  ["rh", "Recursos Humanos", "Gestão de pessoas"],
  ["operador", "Operador", "Apenas leitura"],
];
export const roleLabel = (r: string) => ROLES.find((x) => x[0] === r)?.[1] ?? r;

const all = (n: number) => Object.fromEntries(MODULES.map(([k]) => [k, n])) as Record<string, number>;
// Equivalente ao que a migração 0019 cria; usado também enquanto a migração não foi aplicada.
export const DEFAULT_ROLE_PERMS: Record<string, Record<string, number>> = {
  super_admin: all(3),
  administrador: { dashboard: 3, escritorios: 2, empresas: 2, contratos: 2, financeiro: 2, eventos: 2, restaurante: 2, operacoes: 2, rh: 2, relatorios: 2, administracao: 2 },
  financeiro: { dashboard: 1, escritorios: 2, empresas: 2, contratos: 2, financeiro: 2, eventos: 1, restaurante: 1, operacoes: 2, relatorios: 1 },
  eventos: { dashboard: 1, escritorios: 1, empresas: 1, contratos: 1, financeiro: 1, eventos: 2, restaurante: 2, operacoes: 2, relatorios: 1 },
  rh: { dashboard: 1, escritorios: 1, empresas: 1, contratos: 1, eventos: 1, restaurante: 1, operacoes: 1, rh: 2, relatorios: 1 },
  restaurante: { dashboard: 1, eventos: 1, restaurante: 2, operacoes: 1, relatorios: 1 },
  operacoes: { dashboard: 1, escritorios: 1, operacoes: 2, relatorios: 1 },
  operador: { dashboard: 1, escritorios: 1, empresas: 1, contratos: 1, financeiro: 1, eventos: 1, restaurante: 1, operacoes: 1, relatorios: 1 },
};

export const canDo = (perms: Record<string, number> | undefined, module: string, need = 2) => (perms?.[module] ?? 0) >= need;
