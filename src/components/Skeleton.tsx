const bar = "animate-pulse rounded-md bg-white/[0.07]";

// Esqueleto da página interna (conteúdo). Não revela nenhum texto do sistema.
export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="A carregar">
      <div className={`${bar} h-40 w-full rounded-2xl`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className={`${bar} h-28 rounded-xl`} />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className={`${bar} h-64 rounded-xl`} />)}
      </div>
    </div>
  );
}

// Esqueleto da shell completa (sidebar + cabeçalho + conteúdo), mostrado enquanto se valida a sessão.
export function ShellSkeleton() {
  return (
    <div className="flex min-h-screen" aria-busy="true" aria-label="A carregar">
      <aside className="hidden w-64 shrink-0 space-y-4 border-r border-line bg-[#080d1a] p-4 md:block">
        <div className={`${bar} h-11 w-full`} />
        {Array.from({ length: 12 }).map((_, i) => <div key={i} className={`${bar} h-8 w-full`} />)}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-4 border-b border-line px-6 py-3">
          <div className={`${bar} h-10 max-w-xl flex-1`} />
          <div className={`${bar} ml-auto size-9 rounded-full`} />
        </div>
        <main className="p-4 md:p-6"><PageSkeleton /></main>
      </div>
    </div>
  );
}
