export interface Weather { temp: number; label: string; night: boolean; code: number }

const label = (c: number) =>
  c === 0 ? "Céu limpo" : c <= 2 ? "Pouco nublado" : c === 3 ? "Nublado" : c <= 48 ? "Nevoeiro"
  : c <= 57 ? "Chuvisco" : c <= 67 ? "Chuva" : c <= 82 ? "Aguaceiros" : "Trovoada";

// Tempo atual em Moçâmedes (Open-Meteo, sem chave). Em caso de falha devolve null e o cartão não aparece.
export async function getWeather(): Promise<Weather | null> {
  try {
    const r = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=-15.196&longitude=12.152&current=temperature_2m,weather_code,is_day&timezone=Africa%2FLuanda",
      { next: { revalidate: 1800 }, signal: AbortSignal.timeout(2500) },
    );
    if (!r.ok) return null;
    const j = await r.json();
    const c = j.current;
    return { temp: Math.round(c.temperature_2m), code: c.weather_code, label: label(c.weather_code), night: c.is_day === 0 };
  } catch {
    return null;
  }
}
