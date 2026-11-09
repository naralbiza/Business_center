export const kz = (n: number) => new Intl.NumberFormat("pt-AO", { maximumFractionDigits: 0 }).format(n) + " Kz";
export const datePt = (iso: string) => new Date(iso).toLocaleDateString("pt-PT");

// Escapa texto para o inserir em HTML gerado (relatórios para impressão, exportações .xls)
export const escHtml = (v: string | number | null | undefined) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c] as string);
