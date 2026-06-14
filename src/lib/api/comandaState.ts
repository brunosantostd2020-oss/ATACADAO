import type { Comanda } from "./client";

// Limite (ms) para considerar uma comanda "esquecida" — 1 hora
export const FORGOTTEN_MS = 60 * 60 * 1000;

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

/** Classes de cor (borda/fundo) por estado, para os cards. */
export const stateStyles: Record<ComandaState, string> = {
  paid: "border-emerald-500/60 bg-emerald-500/5",
  partial: "border-amber-500/70 bg-amber-500/10",
  forgotten: "border-red-500/70 bg-red-500/10",
  open: "border-border",
};

export const stateLabel: Record<ComandaState, string> = {
  paid: "PAGA",
  partial: "PARCIAL",
  forgotten: "ESQUECIDA",
  open: "ABERTA",
};

export const stateBadge: Record<ComandaState, string> = {
  paid: "bg-emerald-500/20 text-emerald-400",
  partial: "bg-amber-500/20 text-amber-400",
  forgotten: "bg-red-500/20 text-red-400",
  open: "bg-muted text-muted-foreground",
};
