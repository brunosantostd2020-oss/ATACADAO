import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Package,
  Plus,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  History,
  Beer,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/api/auth";
import { LoginScreen } from "@/components/LoginScreen";
import { productsApi, type StockProduct, type StockMovement } from "@/lib/api/client";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/estoque")({
  head: () => ({ meta: [{ title: "Estoque — Atacadão Cervejaria" }] }),
  component: StockPage,
});

function StockPage() {
  const { user, loading, logout } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center"><div className="animate-spin size-6 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (!user) return <LoginScreen />;
  return <StockDashboard />;
}

function StockDashboard() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [selectedProduct, setSelectedProduct] = useState<StockProduct | null>(null);
  const [entryQty, setEntryQty] = useState("");
  const [adjustQty, setAdjustQty] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const panel = useQuery({
    queryKey: ["stock-panel"],
    queryFn: productsApi.stockPanel,
    refetchInterval: 15000,
  });

  const history = useQuery({
    queryKey: ["stock-history", selectedProduct?.id],
    queryFn: () => productsApi.stockHistory(selectedProduct!.id),
    enabled: !!selectedProduct && historyOpen,
  });

  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro.");

  const entry = useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) =>
      productsApi.stockEntry(id, qty, "Reposição de estoque"),
    onSuccess: () => {
      toast.success("Estoque atualizado!");
      setEntryQty("");
      qc.invalidateQueries({ queryKey: ["stock-panel"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError,
  });

  const adjust = useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) =>
      productsApi.stockAdjust(id, qty, "Ajuste de inventário"),
    onSuccess: () => {
      toast.success("Estoque ajustado!");
      setAdjustQty("");
      qc.invalidateQueries({ queryKey: ["stock-panel"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError,
  });

  const products = panel.data ?? [];
  const esgotados = products.filter((p) => p.stock_status === "esgotado");
  const baixos = products.filter((p) => p.stock_status === "baixo");
  const ok = products.filter((p) => p.stock_status === "ok");

  const statusIcon = (s: string) => {
    if (s === "esgotado") return <XCircle className="size-4 text-red-400" />;
    if (s === "baixo") return <AlertTriangle className="size-4 text-amber-400" />;
    return <CheckCircle2 className="size-4 text-emerald-400" />;
  };

  const statusBadge = (s: string) => {
    if (s === "esgotado") return "bg-red-500/20 text-red-400 border-red-500/30";
    if (s === "baixo") return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  };

  const statusLabel = (s: string) => {
    if (s === "esgotado") return "ESGOTADO";
    if (s === "baixo") return "BAIXO";
    return "OK";
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon" title="Voltar às comandas">
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Package className="size-4" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight leading-none">CONTROLE DE ESTOQUE</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Atacadão Cervejaria</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="size-4" /></Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Alertas no topo */}
        {(esgotados.length > 0 || baixos.length > 0) && (
          <div className="space-y-2">
            {esgotados.length > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm">
                <XCircle className="size-5 text-red-400 shrink-0" />
                <span>
                  <strong className="text-red-400">{esgotados.length} produto{esgotados.length > 1 ? "s" : ""} esgotado{esgotados.length > 1 ? "s"  : ""}:</strong>{" "}
                  {esgotados.map((p) => p.name).join(", ")}. Faça a reposição!
                </span>
              </div>
            )}
            {baixos.length > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm">
                <AlertTriangle className="size-5 text-amber-400 shrink-0" />
                <span>
                  <strong className="text-amber-400">{baixos.length} produto{baixos.length > 1 ? "s" : ""} com estoque baixo:</strong>{" "}
                  {baixos.map((p) => `${p.name} (${p.stock_qty} un.)`).join(", ")}
                </span>
              </div>
            )}
          </div>
        )}

        {/* KPIs */}
        <section className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total produtos</div>
            <div className="text-2xl font-bold mt-1">{products.length}</div>
          </Card>
          <Card className="p-4 text-center border-amber-500/30">
            <div className="text-xs uppercase tracking-wide text-amber-400">Estoque baixo</div>
            <div className="text-2xl font-bold mt-1 text-amber-400">{baixos.length + esgotados.length}</div>
          </Card>
          <Card className="p-4 text-center border-emerald-500/30">
            <div className="text-xs uppercase tracking-wide text-emerald-400">Estoque ok</div>
            <div className="text-2xl font-bold mt-1 text-emerald-400">{ok.length}</div>
          </Card>
        </section>

        {/* Lista de produtos */}
        {panel.isLoading ? (
          <Card className="p-8 text-center text-muted-foreground">Carregando estoque...</Card>
        ) : products.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <Package className="size-8 mx-auto mb-2 opacity-40" />
            <p>Nenhum produto com controle de estoque ativo.</p>
            <p className="text-xs mt-1">Ative o controle de estoque no Cardápio (tela principal).</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y divide-border">
              {products.map((p) => (
                <div key={p.id} className={`flex items-center gap-3 px-4 py-3 ${p.stock_status === "esgotado" ? "bg-red-500/5" : p.stock_status === "baixo" ? "bg-amber-500/5" : ""}`}>
                  <div className="shrink-0">{statusIcon(p.stock_status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Mínimo: {p.stock_min} un. · Categoria: {p.category}
                    </div>
                  </div>
                  <div className="text-center shrink-0">
                    <div className="text-2xl font-bold">{p.stock_qty}</div>
                    <div className="text-xs text-muted-foreground">un.</div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${statusBadge(p.stock_status)}`}>
                    {statusLabel(p.stock_status)}
                  </Badge>
                  <div className="flex gap-1 shrink-0 ml-auto">
                    <Button size="sm" variant="outline"
                      onClick={() => { setSelectedProduct(p); setEntryQty(""); setAdjustQty(""); setHistoryOpen(false); }}
                      title="Repor estoque">
                      <Plus className="size-3.5 mr-1" /> Repor
                    </Button>
                    <Button size="icon" variant="ghost"
                      onClick={() => { setSelectedProduct(p); setHistoryOpen(true); }}
                      title="Histórico">
                      <History className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </main>

      {/* Dialog reposição / ajuste */}
      <Dialog open={!!selectedProduct && !historyOpen} onOpenChange={(o) => !o && setSelectedProduct(null)}>
        <DialogContent className="max-w-sm">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Beer className="size-4" /> {selectedProduct.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                  <span className="text-sm text-muted-foreground">Estoque atual</span>
                  <span className="text-2xl font-bold">{selectedProduct.stock_qty} un.</span>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Entrada (reposição)</div>
                  <div className="flex gap-2">
                    <Input type="number" min="1" inputMode="numeric" placeholder="Quantidade" value={entryQty}
                      onChange={(e) => setEntryQty(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && entryQty && entry.mutate({ id: selectedProduct.id, qty: parseInt(entryQty) })} />
                    <Button disabled={!entryQty || entry.isPending}
                      onClick={() => entry.mutate({ id: selectedProduct.id, qty: parseInt(entryQty) })}>
                      <Plus className="size-4 mr-1" /> Adicionar
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">Ajuste manual (inventário)</div>
                  <div className="flex gap-2">
                    <Input type="number" min="0" inputMode="numeric" placeholder="Qtd total" value={adjustQty}
                      onChange={(e) => setAdjustQty(e.target.value)} />
                    <Button variant="secondary" disabled={adjustQty === "" || adjust.isPending}
                      onClick={() => adjust.mutate({ id: selectedProduct.id, qty: parseInt(adjustQty) })}>
                      <TrendingDown className="size-4 mr-1" /> Ajustar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Use quando for contar o estoque físico e corrigir diferenças.</p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog histórico */}
      <Dialog open={!!selectedProduct && historyOpen} onOpenChange={(o) => { if (!o) { setHistoryOpen(false); setSelectedProduct(null); } }}>
        <DialogContent className="max-w-sm">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle>Histórico — {selectedProduct.name}</DialogTitle>
              </DialogHeader>
              <div className="max-h-80 overflow-auto space-y-1">
                {history.isLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
                ) : (history.data?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sem movimentações.</p>
                ) : (
                  history.data!.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 px-2 py-2 rounded border border-border text-sm">
                      <span className={`font-bold w-10 text-right shrink-0 ${m.qty > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {m.qty > 0 ? "+" : ""}{m.qty}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{m.reason}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(m.created_at).toLocaleString("pt-BR")}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
