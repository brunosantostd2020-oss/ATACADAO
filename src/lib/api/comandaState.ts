import type { Comanda } from "./client";

// Limite (ms) para comanda "esquecida" — 1 hora e meia
export const FORGOTTEN_MS = 90 * 60 * 1000;

export type ComandaState = "paid" | "partial" | "forgotten" | "open";

/** Classifica a comanda para fins de cor/aviso. */
export function comandaState(c: Comanda): ComandaState {
  if (c.status === "paid") return "paid";
  if (c.status === "partial") return "partial";
  const age = Date.now() - new Date(c.created_at).getTime();
  if (age > FORGOTTEN_MS) return "forgotten";
  return "open";
}

/** Tempo decorrido em formato curto: "45min", "2h10". */
export function elapsed(fromIso: string): string {
  const ms = Date.now() - new Date(fromIso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/** Classes de cor por estado — cards com fundo mais forte pro verde/vermelho */
export const stateStyles: Record<ComandaState, string> = {
  // Verde forte — quitada
  paid:      "border-emerald-500 bg-emerald-500/20",
  // Amarelo — pagou parte
  partial:   "border-amber-500/70 bg-amber-500/10",
  // Vermelho forte — esquecida (+1h30)
  forgotten: "border-red-500 bg-red-500/20",
  // Normal — aberta recente
  open:      "border-border",
};

export const stateLabel: Record<ComandaState, string> = {
  paid:      "PAGA",
  partial:   "PARCIAL",
  forgotten: "ESQUECIDA",
  open:      "ABERTA",
};

export const stateBadge: Record<ComandaState, string> = {
  paid:      "bg-emerald-500/30 text-emerald-300 font-bold",
  partial:   "bg-amber-500/20 text-amber-400",
  forgotten: "bg-red-500/30 text-red-300 font-bold",
  open:      "bg-muted text-muted-foreground",
};
