import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import * as I from "@/components/icons";
import CountUp from "@/components/dashboard/CountUp";
import { getDebts, getMonthly, getOffices, getReservations, getVenues } from "@/lib/data";
import { getWeather } from "@/lib/weather";

const TZ = "Africa/Luanda";
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTHS_LONG = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAYS = ["Domingo", "Segunda-Feira", "Terça-Feira", "Quarta-Feira", "Quinta-Feira", "Sexta-Feira", "Sábado"];
type Ico = React.ComponentType<{ className?: string }>;
const vars = (o: Record<string, string | number>) => o as CSSProperties;

// Texto que aparece letra a letra (cada letra desfoca-se e sobe). "gold" acrescenta uma onda de brilho dourado.
function Letters({ text, delay = 0, step = 0.035, gold = false }: { text: string; delay?: number; step?: number; gold?: boolean }) {
  return (
    <span aria-label={text}>
      {Array.from(text).map((ch, i) => <span key={i} aria-hidden className={`a-letter${gold ? " gold" : ""}`} style={vars({ "--d": `${(delay + i * step).toFixed(3)}s` })}>{ch}</span>)}
    </span>
  );
}

// Partículas douradas sobre o hero (posições fixas, sem aleatoriedade: servidor e cliente coincidem)
const BOKEH = [
  { x: "34%", y: "8%", s: 6, t: 13, d: 0.2, dx: 14, o: 0.6 }, { x: "42%", y: "2%", s: 4, t: 16, d: 3, dx: -10, o: 0.5 }, { x: "49%", y: "12%", s: 8, t: 14, d: 6, dx: 18, o: 0.45 },
  { x: "56%", y: "4%", s: 5, t: 18, d: 1.5, dx: -16, o: 0.6 }, { x: "63%", y: "10%", s: 7, t: 15, d: 8, dx: 12, o: 0.5 }, { x: "70%", y: "0%", s: 4, t: 17, d: 4, dx: -8, o: 0.55 },
  { x: "77%", y: "9%", s: 6, t: 12, d: 10, dx: 16, o: 0.5 }, { x: "84%", y: "3%", s: 5, t: 19, d: 2.5, dx: -14, o: 0.6 }, { x: "91%", y: "11%", s: 7, t: 14, d: 7, dx: 10, o: 0.45 },
  { x: "96%", y: "5%", s: 4, t: 16, d: 12, dx: -12, o: 0.5 },
];

const axis = (n: number) => (n >= 1e6 ? `${n / 1e6}M` : n === 0 ? "0" : `${n / 1e3}k`);

export const instant = false;

// Indicador circular (148 px): aro luminoso na cor do indicador, ícone, número e legenda dentro do círculo.
function Ring({ id, color, light, pct, icon: Icon, to, kind = "int", unit, label, delay = 0 }: {
  id: string; color: string; light: string; pct: number; icon: Ico; to: number; kind?: "int" | "compact"; unit?: string; label: string; delay?: number;
}) {
  const R = 70, C = 2 * Math.PI * R;
  const len = (Math.min(Math.max(pct, 10), 100) / 100) * C;
  return (
    <div className="a-up group relative mx-auto size-[148px]" style={vars({ "--d": `${delay}s` })}>
      <div className="a-float size-full" style={vars({ "--d": `${delay + 0.6}s` })}>
        <div className="a-breathe-soft absolute inset-3 rounded-full blur-2xl" style={vars({ background: color, "--d": `${delay}s` })} aria-hidden />
        <div className="relative size-full transition-transform duration-500 group-hover:scale-[1.05]">
          <svg viewBox="0 0 150 150" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            <defs>
              <radialGradient id={`disc-${id}`} cx="50%" cy="25%" r="85%"><stop offset="0" stopColor={color} stopOpacity="0.2" /><stop offset="1" stopColor="#06101a" stopOpacity="0.95" /></radialGradient>
              <linearGradient id={`arc-${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={light} /><stop offset="1" stopColor={color} /></linearGradient>
              <filter id={`glow-${id}`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <circle cx="75" cy="75" r="73" fill="#050e16" />
            <circle cx="75" cy="75" r="73" fill={`url(#disc-${id})`} />
            <circle cx="75" cy="75" r="65" fill="none" stroke={color} strokeOpacity="0.2" strokeWidth="1" />
            <circle cx="75" cy="75" r={R} fill="none" stroke={color} strokeOpacity="0.5" strokeWidth="4" />
            <g transform="rotate(-90 75 75)">
              <circle className="a-arc" cx="75" cy="75" r={R} fill="none" stroke={`url(#arc-${id})`} strokeWidth="4.5" strokeLinecap="round" filter={`url(#glow-${id})`} style={vars({ "--len": len, "--c": C, "--d": `${delay + 0.25}s` })} />
            </g>
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div className="-mt-1">
              <span className="block" style={{ color: light }}><Icon className="mx-auto size-[26px]" /></span>
              <div className="mt-1 text-[31px] font-medium leading-none tracking-tight text-white tabular-nums">
                <CountUp to={to} kind={kind} delay={delay * 1000 + 300} />{unit && <span className="ml-1 text-[11px] font-medium text-slate-200">{unit}</span>}
              </div>
              <div className="mt-1.5 text-[11.5px] text-slate-100">{label}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Cartão compacto: ícone dourado, título e ação à direita (medidas do desenho: 220 px e 160 px de altura)
function Panel({ icon: Icon, title, href, action, children, delay = 0, className = "" }: { icon: Ico; title: string; href?: string; action?: ReactNode; children: ReactNode; delay?: number; className?: string }) {
  return (
    <section className={`a-up relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.11] bg-gradient-to-b from-[#0f1d2a]/95 to-[#08131c]/95 px-5 pb-3 pt-3.5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] backdrop-blur transition-colors duration-300 hover:border-gold/30 ${className}`} style={vars({ "--d": `${delay}s` })}>
      <span className="panel-shine" style={vars({ "--d": `${delay + 1}s` })} aria-hidden />
      <header className="flex h-10 shrink-0 items-center gap-3">
        <Icon className="size-[30px] text-gold" />
        <h2 className="flex-1 text-[19px] font-medium leading-none"><Letters text={title} delay={delay + 0.2} step={0.03} /></h2>
        {action}
        {href && <Link href={href} aria-label={`Abrir ${title}`} className="grid size-7 place-items-center rounded-full border border-white/12 bg-white/[0.07] text-slate-100 transition hover:translate-x-0.5 hover:border-gold/50 hover:bg-gold/10 hover:text-gold"><I.ChevR className="size-4" /></Link>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col justify-center pt-2">{children}</div>
    </section>
  );
}

export default async function Dashboard() {
  const [offices, debts, monthly, reservations, venues, weather] = await Promise.all([getOffices(), getDebts(), getMonthly(), getReservations(), getVenues(), getWeather()]);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthKey = today.slice(0, 7);

  // ── Indicadores
  const occupied = offices.filter((o) => o.status === "ocupado").length;
  const free = offices.filter((o) => o.status === "livre").length;
  const reserved = offices.filter((o) => ["reservado", "manutencao", "bloqueado"].includes(o.status)).length;
  const occ = offices.length ? Math.round((occupied / offices.length) * 100) : 0;
  const overdue = debts.filter((d) => d.days_overdue > 0);
  const revenue = monthly.at(-1)?.revenue ?? 0;
  const bestRevenue = Math.max(...monthly.map((m) => m.revenue), 1);
  const eventsThisMonth = reservations.filter((r) => r.starts_at.slice(0, 7) === monthKey);
  const evConfirmed = eventsThisMonth.filter((r) => r.status === "confirmada").length;
  const next = reservations.filter((r) => r.ends_at.slice(0, 10) >= today)[0];

  // ── Receita vs Dívidas
  const chartMax = Math.max(...monthly.map((m) => Math.max(m.revenue, m.debt)), 0);
  const step = chartMax > 20e6 ? 10e6 : chartMax > 8e6 ? 5e6 : chartMax > 2e6 ? 2e6 : chartMax > 8e5 ? 5e5 : 2e5;
  const top = Math.max(step * 4, Math.ceil(chartMax / step) * step);
  const ticks = Array.from({ length: 5 }, (_, i) => (top / 4) * (4 - i));

  // ── Distribuição dos espaços (escritórios + salão de festas)
  const slices = [
    { label: "Ocupados", n: occupied, color: "#e6b93c" },
    { label: "Livres", n: free, color: "#b79cf5" },
    { label: "Reservados", n: reserved, color: "#f59a2b" },
    { label: "Salão de Festas", n: venues.length, color: "#f0527c" },
  ];
  const total = slices.reduce((s, x) => s + x.n, 0);
  const R = 70, C = 2 * Math.PI * R;
  let acc = 0;

  // ── Data de hoje no fuso de Luanda ("Quinta-Feira, 5 de Novembro de 2026")
  const luanda = new Date(now.getTime() + 3600e3);
  const dateLabel = `${WEEKDAYS[luanda.getUTCDay()]}, ${luanda.getUTCDate()} de ${MONTHS_LONG[luanda.getUTCMonth()]} de ${luanda.getUTCFullYear()}`;

  const hm = (iso: string) => new Date(iso).toLocaleTimeString("pt-PT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const nextDate = next ? new Date(next.starts_at) : null;
  const nextDay = nextDate ? `${nextDate.toLocaleDateString("pt-PT", { day: "2-digit", timeZone: TZ })} ${MONTHS[Number(nextDate.toLocaleDateString("en-GB", { month: "numeric", timeZone: TZ })) - 1]}` : "";

  const quick: { t: string; href: string; icon: Ico; gold?: boolean }[] = [
    { t: "Escritório", href: "/escritorios?novo=1", icon: I.Building, gold: true },
    { t: "Contrato", href: "/contratos/novo", icon: I.File },
    { t: "Evento", href: "/eventos/novo", icon: I.Calendar },
    { t: "Pagamento", href: "/dividas", icon: I.Wallet },
  ];

  return (
    <>
      {/* ───── Abertura ───── */}
      <section className="relative isolate -mx-4 -mt-[calc(4rem+1rem)] min-h-[400px] overflow-hidden px-4 pb-16 pt-[calc(4rem+2.4rem)] md:-mx-6 md:-mt-[calc(4rem+1.5rem)] md:h-[400px] md:min-h-0 md:px-12">
        <div className="absolute right-0 top-16 -z-20 aspect-[3050/1083] w-full overflow-hidden md:w-[68%]" style={{ maskImage: "linear-gradient(to right, transparent 0, #000 18%)", WebkitMaskImage: "linear-gradient(to right, transparent 0, #000 18%)" }}>
          <Image src="/hero-dash-v3.jpg" alt="" fill priority quality={90} sizes="(max-width: 768px) 100vw, 68vw" className="a-imgdrift object-cover opacity-55 md:opacity-100" />
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#020b13]/85 via-[#020b13]/25 to-transparent md:from-transparent md:via-transparent" />
        <div className="absolute inset-0 -z-10" style={{ background: "linear-gradient(to top, #020b13 0, rgba(2,11,19,0) 24%), linear-gradient(to bottom, rgba(2,11,19,0.55) 0, rgba(2,11,19,0) 18%)" }} />
        <svg className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-24 w-full" viewBox="0 0 1200 100" preserveAspectRatio="none" aria-hidden>
          <defs><linearGradient id="swoosh" x1="0" x2="1"><stop offset="0" stopColor="#d6b06a" stopOpacity="0" /><stop offset="0.25" stopColor="#d6b06a" stopOpacity="0.85" /><stop offset="0.7" stopColor="#f3dfae" stopOpacity="0.5" /><stop offset="1" stopColor="#f3dfae" stopOpacity="0.15" /></linearGradient></defs>
          <path className="a-arc" pathLength={1} d="M0 96 C 300 100 700 90 1200 40" fill="none" stroke="url(#swoosh)" strokeWidth="2" style={vars({ "--len": 1, "--c": 1, "--d": "0.4s" })} />
        </svg>

        {/* Partículas douradas (ambiente) */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
          {BOKEH.map((b, i) => <i key={i} className="bokeh" style={vars({ left: b.x, bottom: b.y, width: b.s, height: b.s, "--t": `${b.t}s`, "--d": `${b.d}s`, "--dx": `${b.dx}px`, "--o": b.o })} />)}
        </div>

        {/* Data e meteorologia */}
        <div className="a-up mb-6 flex w-fit items-center gap-4 rounded-xl border border-white/15 bg-[#07121b]/80 px-4 py-2.5 text-sm backdrop-blur md:absolute md:right-7 md:top-20 md:mb-0 md:h-[61px]" style={vars({ "--d": "0.5s" })}>
          <I.Calendar className="size-6 text-slate-100" />
          <div className="leading-tight"><div className="text-[12.5px] font-medium">{dateLabel}</div><div className="mt-0.5 text-[11px] text-slate-300">Moçâmedes, Namibe</div></div>
          {weather && (
            <>
              <span className="h-8 w-px bg-white/20" aria-hidden />
              {weather.night ? <I.Moon className="size-7 text-gold" /> : weather.code <= 2 ? <I.Sun className="size-7 text-gold" /> : <I.Cloud className="size-7 text-gold" />}
              <div className="leading-tight"><div className="text-lg font-medium">{weather.temp}°C</div><div className="text-[11px] text-slate-300">{weather.label}</div></div>
            </>
          )}
        </div>

        <p className="text-lg text-slate-100"><Letters text="Bem-vindo ao" delay={0.05} step={0.04} /></p>
        <h1 className="mt-1.5 text-[38px] leading-[1.05] md:text-[40px]"><Letters text="Business Center" delay={0.4} step={0.045} /><br /><span className="text-[46px] md:text-[52px]"><Letters text="Esperança" delay={1.05} step={0.07} gold /></span></h1>
        <p className="a-up mt-3.5 max-w-[19.5rem] text-[15px] leading-[23px] text-slate-100" style={vars({ "--d": "1.9s" })}>Gestão integrada de escritórios, contratos, eventos e operações.</p>
        <div className="a-up mt-6 flex flex-wrap gap-6" style={vars({ "--d": "2.1s" })}>
          <Link href="/contratos/novo" className="a-sheen relative flex h-[42px] items-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-b from-[#f7d978] to-[#d9a62f] px-[22px] text-[14px] font-medium text-[#1a1305] shadow-[0_10px_30px_-12px_rgba(240,194,74,0.7)] transition hover:-translate-y-0.5 hover:brightness-105"><I.Plus className="size-5" />Novo Contrato</Link>
          <Link href="/agenda" className="flex h-[42px] items-center gap-3 rounded-xl border border-white/30 bg-[#07121b]/60 px-[22px] text-[14px] text-white backdrop-blur transition hover:-translate-y-0.5 hover:border-gold/60 hover:bg-white/10"><I.Calendar className="size-5" />Agendar Evento</Link>
        </div>
      </section>

      <div className="-mt-[26px] md:px-[22px]">
        {/* ───── Indicadores ───── */}
        <div className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-2 gap-y-8 md:grid-cols-4">
          <Ring id="off" color="#e0b23a" light="#f6d77d" pct={occ} icon={I.Building} to={offices.length} label="Escritórios" delay={0.1} />
          <Ring id="rev" color="#19c37d" light="#7ee8ae" pct={Math.round((revenue / bestRevenue) * 100)} icon={I.Coins} to={revenue} kind="compact" unit="AOA" label="Receita Mensal" delay={0.22} />
          <Ring id="dbt" color="#e5334f" light="#ff8fa0" pct={debts.length ? Math.round((overdue.length / debts.length) * 100) : 0} icon={I.Receipt} to={overdue.length} label="Dívidas em Atraso" delay={0.34} />
          <Ring id="evt" color="#8e5cff" light="#c1a8ff" pct={eventsThisMonth.length ? Math.round((evConfirmed / eventsThisMonth.length) * 100) : 0} icon={I.Calendar} to={eventsThisMonth.length} label="Eventos do Mês" delay={0.46} />
        </div>

        {/* ───── Receita vs Dívidas · Distribuição dos Espaços ───── */}
        <div className="mt-[13px] grid gap-[26px] lg:grid-cols-2">
          <Panel icon={I.Chart} title="Receita vs Dívidas" delay={0.55} className="lg:min-h-[236px]"
            action={<span className="flex h-8 items-center gap-2 rounded-lg border border-white/12 bg-white/[0.05] px-3 text-sm text-slate-100">{now.getFullYear()}<span className="text-[10px] text-slate-300">⌄</span></span>}>
            <div className="flex gap-3">
              <div className="flex h-[104px] flex-col justify-between text-right text-[12px] leading-none text-slate-200">
                {ticks.map((t) => <span key={t}>{axis(t)}</span>)}
              </div>
              <div className="relative flex-1">
                <div className="absolute inset-x-0 top-0 flex h-[104px] flex-col justify-between" aria-hidden>
                  {ticks.map((t, i) => <i key={t} className="a-line block h-px bg-white/[0.1]" style={vars({ "--d": `${0.6 + i * 0.08}s` })} />)}
                </div>
                <div className="relative flex items-end gap-1">
                  {monthly.length === 0 ? <p className="m-auto h-[104px] text-sm text-slate-400">Sem dados este ano.</p> : monthly.map((m, i) => (
                    <div key={m.month} className="flex flex-1 flex-col items-center">
                      <div className="flex h-[104px] w-full items-end justify-center gap-px">
                        <div className="a-grow a-shine w-[40%] rounded-t-[3px] bg-gradient-to-t from-[#d49a1f] to-[#f3cf62] transition hover:brightness-125" style={vars({ height: `${Math.max((m.revenue / top) * 100, m.revenue > 0 ? 2 : 0)}%`, "--d": `${0.8 + i * 0.06}s`, "--d2": `${2 + i * 0.35}s` })} title={`${axis(m.revenue)} AOA`} />
                        {m.debt > 0 && <div className="a-grow a-shine w-[30%] rounded-t-[3px] bg-gradient-to-t from-[#c92a3d] to-[#f0566a] transition hover:brightness-125" style={vars({ height: `${Math.max((m.debt / top) * 100, 2)}%`, "--d": `${0.9 + i * 0.06}s`, "--d2": `${2.4 + i * 0.35}s` })} title={`${axis(m.debt)} AOA`} />}
                      </div>
                      <span className="a-fade mt-1.5 text-[11.5px] leading-none text-slate-100" style={vars({ "--d": `${1 + i * 0.06}s` })}>{m.month}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-2.5 flex justify-center gap-14 text-[14px] text-slate-100">
              <span className="flex items-center gap-2"><i className="size-3.5 rounded-full bg-[#f0b429]" />Receita</span>
              <span className="flex items-center gap-2"><i className="size-3.5 rounded-full bg-[#e5484d]" />Dívidas</span>
            </div>
          </Panel>

          <Panel icon={I.Pin} title="Distribuição dos Espaços" href="/escritorios" delay={0.67} className="lg:min-h-[236px]">
            <div className="flex flex-wrap items-center justify-center gap-x-14">
              <div className="relative size-[160px] shrink-0">
                <svg viewBox="0 0 180 180" className="-rotate-90" aria-hidden>
                  <defs><linearGradient id="gold-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6d56a" /><stop offset="1" stopColor="#c9921f" /></linearGradient></defs>
                  <circle cx="90" cy="90" r={R} fill="none" stroke="#14202c" strokeWidth="24" />
                  {total > 0 && slices.filter((s) => s.n > 0).map((s, i) => {
                    const len = Math.max((s.n / total) * C - 2, 0);
                    const el = <circle key={s.label} className="a-arc slice" cx="90" cy="90" r={R} fill="none" stroke={s.label === "Ocupados" ? "url(#gold-ring)" : s.color} strokeWidth="24" transform={`rotate(${(acc / C) * 360} 90 90)`} style={vars({ "--len": len, "--c": C, "--d": `${0.9 + i * 0.18}s` })} />;
                    acc += (s.n / total) * C;
                    return el;
                  })}
                </svg>
                <div className="absolute inset-0 grid place-items-center text-center"><div><div className="text-[36px] font-medium leading-none"><CountUp to={total} delay={900} /></div><div className="mt-1 text-[15px] text-slate-100">Total</div></div></div>
              </div>
              <ul className="w-[250px] space-y-[11px] text-[15px]">
                {slices.map((s, i) => (
                  <li key={s.label} className="a-up flex items-center gap-3 leading-[21px]" style={vars({ "--d": `${1 + i * 0.1}s` })}>
                    <i className="size-[15px] shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="flex-1">{s.label}</span>
                    <span className="w-6 text-right tabular-nums">{s.n}</span>
                    <span className="w-12 text-right tabular-nums text-slate-100">({total ? Math.round((s.n / total) * 100) : 0}%)</span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        </div>

        {/* ───── Próximo Evento · Acesso Rápido ───── */}
        <div className="mt-[15px] grid gap-[26px] lg:grid-cols-2">
          <Panel icon={I.Calendar} title="Próximo Evento" href="/agenda" delay={0.78} className="lg:min-h-[160px]">
            {!next ? <p className="py-3 text-center text-sm text-slate-400">Sem eventos marcados.</p> : (
              <div className="group flex items-center gap-[30px]">
                <div className="relative h-[94px] w-[154px] shrink-0 overflow-hidden rounded-xl border border-gold/30"><Image src="/ev1.jpg" alt="" fill sizes="160px" className="object-cover transition-transform duration-700 group-hover:scale-110" /></div>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-[17px] font-medium leading-[21px]">{next.title}</div>
                  <div className="mt-1.5 flex items-center gap-2.5 text-[15px] text-slate-100"><I.Calendar className="size-[18px] text-gold" />{nextDay}</div>
                  <div className="mt-1 flex items-center gap-2.5 text-[15px] text-slate-100"><I.Clock className="size-[18px] text-gold" />{hm(next.starts_at)} – {hm(next.ends_at)}</div>
                </div>
                <Link href="/agenda" aria-label="Abrir agenda" className="a-ping grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#f7d978] to-[#d9a62f] text-[#1a1305] shadow-lg transition hover:scale-110"><I.Arrow className="size-5" /></Link>
              </div>
            )}
          </Panel>

          <Panel icon={I.Bolt} title="Acesso Rápido" href="/escritorios" delay={0.9} className="lg:min-h-[160px]">
            <div className="grid grid-cols-2 gap-[19px] sm:grid-cols-4">
              {quick.map((q, i) => (
                <Link key={q.t} href={q.href} style={vars({ "--d": `${1.05 + i * 0.08}s` })}
                  className={`a-up group flex h-[86px] flex-col items-center justify-center gap-2.5 rounded-xl border px-2 text-center text-[14px] transition duration-300 hover:-translate-y-1 ${q.gold
                    ? "border-gold/70 bg-gradient-to-b from-[#6b5426] to-[#3a2e17] text-white shadow-[0_10px_30px_-14px_rgba(214,176,106,0.7)] hover:shadow-[0_14px_36px_-12px_rgba(214,176,106,0.9)]"
                    : "border-white/12 bg-white/[0.03] text-slate-100 hover:border-gold/40 hover:bg-white/[0.07] hover:shadow-[0_14px_30px_-16px_rgba(214,176,106,0.5)]"}`}>
                  <q.icon className={`tile-icon size-[30px] ${q.gold ? "text-gold-soft" : "text-gold"}`} />{q.t}
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <svg className="pointer-events-none -mx-4 h-16 w-[calc(100%+2rem)] md:-mx-6 md:w-[calc(100%+3rem)]" viewBox="0 0 1200 80" preserveAspectRatio="none" aria-hidden>
        <defs><linearGradient id="swoosh2" x1="0" x2="1"><stop offset="0" stopColor="#d6b06a" stopOpacity="0" /><stop offset="0.5" stopColor="#d6b06a" stopOpacity="0.75" /><stop offset="1" stopColor="#d6b06a" stopOpacity="0" /></linearGradient></defs>
        <path className="a-arc" pathLength={1} d="M0 70 C 300 20 800 20 1200 60" fill="none" stroke="url(#swoosh2)" strokeWidth="1.6" style={vars({ "--len": 1, "--c": 1, "--d": "1.2s" })} />
      </svg>
    </>
  );
}
