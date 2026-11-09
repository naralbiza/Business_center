import Link from "next/link";
import { Card } from "@/components/ui";
import { search } from "@/lib/data";

export const instant = false;

export default async function Pesquisa({ searchParams }: PageProps<"/pesquisa">) {
  const { q } = await searchParams;
  const term = typeof q === "string" ? q.trim() : "";
  const hits = await search(term);
  return (
    <>
      <h1 className="text-3xl">Pesquisa{term && `: ${term}`}</h1>
      <Card>
        {term.length < 2 ? <p className="text-sm text-muted">Escreve pelo menos 2 letras.</p>
          : hits.length === 0 ? <p className="text-sm text-muted">Sem resultados.</p> : (
          <ul className="space-y-2 text-sm">
            {hits.map((h, i) => (
              <li key={i} className="flex gap-3 border-b border-line pb-2 last:border-0">
                <span className="w-24 text-xs uppercase text-muted">{h.kind}</span>
                <Link href={h.href} className="text-gold">{h.title}</Link>
                <span className="text-muted">{h.sub}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
