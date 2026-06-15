import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Calendar,
  CreditCard,
  LogOut,
  Printer,
} from "lucide-react";
import { useAuth } from "@/lib/api/auth";
import { LoginScreen } from "@/components/LoginScreen";
import { reportsApi } from "@/lib/api/client";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Atacadão Cervejaria" }] }),
  component: ReportsPage,
});

const fmt = (cents: number) =>
  ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const today = () => new Date().toISOString().slice(0, 10);
const methodLabel: Record<string, string> = {
  dinheiro: "💵 Dinheiro",
  pix: "📱 Pix",
  cartao: "💳 Cartão",
  outro: "Outro",
};

function ReportsPage() {
  const { user, loading, logout } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center"><div className="animate-spin size-6 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (!user) return <LoginScreen />;
  return <Reports logout={logout} />;
}

function Reports({ logout }: { logout: () => void }) {
  const [tab, setTab] = useState<"caixa" | "vendas">("caixa");
  const [caixaDate, setCaixaDate] = useState(today());
  const [vendasStart, setVendasStart] = useState(today());
  const [vendasEnd, setVendasEnd] = useState(today());

  const caixa = useQuery({
    queryKey: ["caixa", caixaDate],
    queryFn: () => reportsApi.caixa(caixaDate),
  });

  const vendas = useQuery({
    queryKey: ["vendas", vendasStart, vendasEnd],
    queryFn: () => reportsApi.vendas(vendasStart, vendasEnd),
    enabled: tab === "vendas",
  });

  const printCaixa = () => {
    if (!caixa.data) return;
    const d = caixa.data;
    const lines = [
      "ATACADAO CERVEJARIA",
      "FECHAMENTO DE CAIXA",
      "================================",
      `Data: ${new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR")}`,
      "================================",
      "",
      "RECEBIMENTOS:",
      ...d.pagamentos.map(p => `  ${(methodLabel[p.payment_method] ?? p.payment_method).padEnd(12)} ${fmt(p.total_cents)}`),
      "",
      `TOTAL RECEBIDO:  ${fmt(d.total_recebido_cents)}`,
      "",
      d.comandas_abertas > 0 ? `A RECEBER:       ${fmt(d.restante_a_receber_cents)}` : "",
      d.comandas_abertas > 0 ? `(${d.comandas_abertas} comanda(s) aberta(s))` : "",
      "",
      "MAIS VENDIDOS:",
      ...d.produtos_mais_vendidos.slice(0, 5).map(p => `  ${p.name.slice(0,16).padEnd(16)} ${p.total_qty}x`),
      "",
      "================================",
      `Impresso: ${new Date().toLocaleString("pt-BR")}`,
    ].filter(l => l !== undefined).join("\n");

    const win = window.open("", "_blank", "width=380,height=600");
    if (!win) { alert("Permita popups para imprimir."); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>Caixa</title><style>
      body{font-family:'Courier New',monospace;font-size:13px;padding:8px;white-space:pre;width:72mm;}
      @media print{@page{margin:0;size:80mm auto;}body{width:72mm;}}
    </style></head><body>${lines}</body><script>window.onload=()=>setTimeout(()=>window.print(),150);</script></html>`);
    win.document.close();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link to="/"><Button variant="ghost" size="icon"><ArrowLeft className="size-4" /></Button></Link>
            <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <TrendingUp className="size-4" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-none">RELATÓRIOS</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Atacadão Cervejaria</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="size-4" /></Button>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3 flex gap-2">
          <Button size="sm" variant={tab === "caixa" ? "default" : "ghost"} onClick={() => setTab("caixa")}>
            Fechamento de Caixa
          </Button>
          <Button size="sm" variant={tab === "vendas" ? "default" : "ghost"} onClick={() => setTab("vendas")}>
            Relatório de Vendas
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {tab === "caixa" && (
          <>
            <div className="flex items-center gap-2">
              <Input type="date" value={caixaDate} onChange={(e) => setCaixaDate(e.target.value)} className="w-44" />
              <Button variant="outline" size="sm" onClick={() => setCaixaDate(today())}>Hoje</Button>
              <Button variant="outline" size="sm" onClick={printCaixa} disabled={!caixa.data}>
                <Printer className="size-3.5 mr-1" /> Imprimir
              </Button>
            </div>

            {caixa.isLoading ? (
              <Card className="p-8 text-center text-muted-foreground">Carregando...</Card>
            ) : caixa.data ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Card className="p-4">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Recebido</div>
                    <div className="text-2xl font-bold text-emerald-400 mt-1">
                      {fmt(caixa.data.total_recebido_cents)}
                    </div>
                    <div className="text-xs text-muted-foreground">{caixa.data.qtd_pagamentos} pagamento(s)</div>
                  </Card>
                  <Card className={`p-4 ${caixa.data.comandas_abertas > 0 ? "border-amber-500/40" : ""}`}>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">A Receber</div>
                    <div className={`text-2xl font-bold mt-1 ${caixa.data.restante_a_receber_cents > 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                      {fmt(caixa.data.restante_a_receber_cents)}
                    </div>
                    <div className="text-xs text-muted-foreground">{caixa.data.comandas_abertas} comanda(s) aberta(s)</div>
                  </Card>
                </div>

                <Card className="p-4 space-y-2">
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    <CreditCard className="size-4" /> Por forma de pagamento
                  </div>
                  {caixa.data.pagamentos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum pagamento neste dia.</p>
                  ) : (
                    caixa.data.pagamentos.map((p) => (
                      <div key={p.payment_method} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                        <div>
                          <div className="font-medium">{methodLabel[p.payment_method] ?? p.payment_method}</div>
                          <div className="text-xs text-muted-foreground">{p.qtd} pagamento(s)</div>
                        </div>
                        <div className="text-lg font-bold">{fmt(p.total_cents)}</div>
                      </div>
                    ))
                  )}
                </Card>

                <Card className="p-4 space-y-2">
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    <ShoppingBag className="size-4" /> Mais vendidos no dia
                  </div>
                  {caixa.data.produtos_mais_vendidos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem vendas neste dia.</p>
                  ) : (
                    caixa.data.produtos_mais_vendidos.map((p, i) => (
                      <div key={p.name} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
                        <div className="size-6 rounded-full bg-muted grid place-items-center text-xs font-bold">{i + 1}</div>
                        <div className="flex-1 min-w-0 truncate font-medium">{p.name}</div>
                        <div className="text-sm text-muted-foreground shrink-0">{p.total_qty}x</div>
                        <div className="font-semibold shrink-0">{fmt(p.total_cents)}</div>
                      </div>
                    ))
                  )}
                </Card>
              </div>
            ) : null}
          </>
        )}

        {tab === "vendas" && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">De:</div>
              <Input type="date" value={vendasStart} onChange={(e) => setVendasStart(e.target.value)} className="w-40" />
              <div className="text-sm text-muted-foreground shrink-0">Até:</div>
              <Input type="date" value={vendasEnd} onChange={(e) => setVendasEnd(e.target.value)} className="w-40" />
              <Button variant="outline" size="sm" onClick={() => { setVendasStart(today()); setVendasEnd(today()); }}>Hoje</Button>
            </div>

            {vendas.isLoading ? (
              <Card className="p-8 text-center text-muted-foreground">Carregando...</Card>
            ) : vendas.data ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Card className="p-4">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Total no Período</div>
                    <div className="text-2xl font-bold text-emerald-400 mt-1">{fmt(vendas.data.total_cents)}</div>
                    <div className="text-xs text-muted-foreground">{vendas.data.qtd_comandas} comanda(s)</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Ticket Médio</div>
                    <div className="text-2xl font-bold mt-1">
                      {vendas.data.qtd_comandas > 0 ? fmt(Math.round(vendas.data.total_cents / vendas.data.qtd_comandas)) : "R$ 0,00"}
                    </div>
                  </Card>
                </div>

                <Card className="p-4 space-y-2">
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    <Calendar className="size-4" /> Por dia
                  </div>
                  {vendas.data.por_dia.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem vendas no período.</p>
                  ) : (
                    vendas.data.por_dia.map((d) => (
                      <div key={d.dia} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                        <div>
                          <div className="font-medium">{new Date(d.dia + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</div>
                          <div className="text-xs text-muted-foreground">{d.qtd_pagamentos} pagamento(s)</div>
                        </div>
                        <div className="text-lg font-bold">{fmt(d.total_cents)}</div>
                      </div>
                    ))
                  )}
                </Card>

                <Card className="p-4 space-y-2">
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    <CreditCard className="size-4" /> Por forma de pagamento
                  </div>
                  {vendas.data.por_metodo.map((p) => (
                    <div key={p.payment_method} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                      <div className="font-medium">{methodLabel[p.payment_method] ?? p.payment_method}</div>
                      <div className="font-bold">{fmt(p.total_cents)}</div>
                    </div>
                  ))}
                </Card>

                <Card className="p-4 space-y-2">
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    <DollarSign className="size-4" /> Top produtos no período
                  </div>
                  {vendas.data.top_produtos.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
                      <div className="size-6 rounded-full bg-muted grid place-items-center text-xs font-bold shrink-0">{i + 1}</div>
                      <div className="flex-1 min-w-0 truncate font-medium">{p.name}</div>
                      <div className="text-sm text-muted-foreground shrink-0">{p.total_qty}x</div>
                      <div className="font-semibold shrink-0">{fmt(p.total_cents)}</div>
                    </div>
                  ))}
                </Card>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
