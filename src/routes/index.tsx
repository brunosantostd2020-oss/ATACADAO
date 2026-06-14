import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Beer,
  Plus,
  Trash2,
  CheckCircle2,
  Receipt,
  X,
  LogOut,
  Loader2,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/api/auth";
import { LoginScreen } from "@/components/LoginScreen";
import {
  comandasApi,
  productsApi,
  type Comanda,
  type Product,
} from "@/lib/api/client";
import {
  comandaState,
  elapsed,
  stateStyles,
  stateLabel,
  stateBadge,
} from "@/lib/api/comandaState";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Atacadão Cervejaria — Comandas" },
      { name: "description", content: "Sistema de comandas para o Atacadão Cervejaria." },
    ],
  }),
  component: Index,
});

const fmt = (cents: number) =>
  ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Index() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <LoginScreen />;
  return <Dashboard />;
}

function Dashboard() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const canManage = user?.role === "admin" || user?.role === "caixa";

  const [newName, setNewName] = useState("");
  const [openComandaId, setOpenComandaId] = useState<string | null>(null);
  const [productsOpen, setProductsOpen] = useState(false);
  const [newProd, setNewProd] = useState({ name: "", price: "" });
  const [payMethod, setPayMethod] = useState("dinheiro");
  const [partialValue, setPartialValue] = useState("");

  // re-renderiza a cada 30s para atualizar os tempos ("45min" -> "46min")
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const products = useQuery({ queryKey: ["products"], queryFn: productsApi.list });
  const comandas = useQuery({
    queryKey: ["comandas"],
    queryFn: () => comandasApi.list(),
    refetchInterval: 8000,
  });
  const summary = useQuery({
    queryKey: ["summary"],
    queryFn: comandasApi.summary,
    refetchInterval: 8000,
  });
  const current = useQuery({
    queryKey: ["comanda", openComandaId],
    queryFn: () => comandasApi.get(openComandaId!),
    enabled: !!openComandaId,
    refetchInterval: openComandaId ? 5000 : false,
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["comandas"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
    if (openComandaId) qc.invalidateQueries({ queryKey: ["comanda", openComandaId] });
  };
  const onError = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Ocorreu um erro.");

  const createComanda = useMutation({
    mutationFn: (customer: string) => comandasApi.create(customer),
    onSuccess: (c) => { setNewName(""); setOpenComandaId(c.id); refreshAll(); },
    onError,
  });
  const addItem = useMutation({
    mutationFn: ({ id, productId }: { id: string; productId: string }) =>
      comandasApi.addItem(id, productId, 1),
    onSuccess: refreshAll, onError,
  });
  const setQty = useMutation({
    mutationFn: ({ id, itemId, qty }: { id: string; itemId: string; qty: number }) =>
      comandasApi.setItemQty(id, itemId, qty),
    onSuccess: refreshAll, onError,
  });
  const pay = useMutation({
    mutationFn: ({ id, method, amount }: { id: string; method: string; amount?: number }) =>
      comandasApi.pay(id, method, amount),
    onSuccess: (c) => {
      setPartialValue("");
      if (c.status === "paid") {
        toast.success("Comanda quitada!");
        setOpenComandaId(null);
      } else {
        toast.success(`Pagamento parcial registrado. Falta ${fmt(c.remaining_cents ?? 0)}.`);
      }
      refreshAll();
    },
    onError,
  });
  const removeComanda = useMutation({
    mutationFn: (id: string) => comandasApi.remove(id),
    onSuccess: () => { setOpenComandaId(null); refreshAll(); }, onError,
  });
  const createProduct = useMutation({
    mutationFn: (p: { name: string; price_cents: number }) => productsApi.create(p),
    onSuccess: () => { setNewProd({ name: "", price: "" }); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError,
  });
  const removeProduct = useMutation({
    mutationFn: (id: string) => productsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }), onError,
  });

  const list = comandas.data ?? [];
  const productList = products.data ?? [];
  const detail = current.data;

  // abertas (inclui parciais e esquecidas) e pagas
  const active = list.filter((c) => c.status === "open" || c.status === "partial");
  const paid = list.filter((c) => c.status === "paid");

  // quem está devendo (tem saldo) — ordenado por mais antiga primeiro
  const devendo = active
    .filter((c) => (c.remaining_cents ?? c.total_cents) > 0 && (c.item_count ?? 0) > 0)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const forgottenCount = active.filter((c) => comandaState(c) === "forgotten").length;

  const s = summary.data;
  const totals = useMemo(
    () => ({
      openCount: s?.open_count ?? 0,
      openSum: s?.open_total_cents ?? 0,
      paidToday: s?.paid_today_cents ?? 0,
    }),
    [s],
  );

  const addProduct = () => {
    const name = newProd.name.trim();
    const price = parseFloat(newProd.price.replace(",", "."));
    if (!name || isNaN(price) || price <= 0) { toast.error("Informe nome e preço válidos."); return; }
    createProduct.mutate({ name, price_cents: Math.round(price * 100) });
  };

  const doPartial = () => {
    if (!detail) return;
    const v = parseFloat(partialValue.replace(",", "."));
    if (isNaN(v) || v <= 0) { toast.error("Informe um valor válido."); return; }
    pay.mutate({ id: detail.id, method: payMethod, amount: Math.round(v * 100) });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Beer className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight leading-none">ATACADÃO CERVEJARIA</h1>
              <p className="text-xs text-muted-foreground mt-1">{user?.name} · {user?.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canManage && (
              <Dialog open={productsOpen} onOpenChange={setProductsOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary" size="sm">Cardápio</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>Gerenciar Cardápio</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Input placeholder="Nome do produto" value={newProd.name}
                        onChange={(e) => setNewProd((p) => ({ ...p, name: e.target.value }))} />
                      <Input placeholder="Preço" className="w-28" value={newProd.price}
                        onChange={(e) => setNewProd((p) => ({ ...p, price: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && addProduct()} />
                      <Button onClick={addProduct} disabled={createProduct.isPending}><Plus className="size-4" /></Button>
                    </div>
                    <div className="max-h-80 overflow-auto divide-y divide-border rounded-md border border-border">
                      {productList.map((p: Product) => (
                        <div key={p.id} className="flex items-center justify-between px-3 py-2">
                          <div>
                            <div className="font-medium text-sm">{p.name}</div>
                            <div className="text-xs text-muted-foreground">{fmt(p.price_cents)}</div>
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => removeProduct.mutate(p.id)}>
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            <Button variant="ghost" size="sm" onClick={logout} title="Sair"><LogOut className="size-4" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Aviso de comandas esquecidas */}
        {forgottenCount > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm">
            <AlertTriangle className="size-5 text-red-400 shrink-0" />
            <span>
              <strong className="text-red-400">
                {forgottenCount} comanda{forgottenCount > 1 ? "s" : ""} aberta
                {forgottenCount > 1 ? "s" : ""} há mais de 1 hora.
              </strong>{" "}
              Verifique se o cliente já foi embora sem pagar.
            </span>
          </div>
        )}

        {/* KPIs */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Comandas Devendo</div>
            <div className="text-2xl font-bold mt-1">{totals.openCount}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total a Receber</div>
            <div className="text-2xl font-bold mt-1 text-red-400">{fmt(totals.openSum)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Recebido Hoje</div>
            <div className="text-2xl font-bold mt-1 text-emerald-400">{fmt(totals.paidToday)}</div>
          </Card>
        </section>

        {/* DEVENDO AGORA */}
        {devendo.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-red-400 mb-3 flex items-center gap-2">
              <AlertTriangle className="size-4" /> Devendo Agora
            </h2>
            <Card className="divide-y divide-border overflow-hidden">
              {devendo.map((c) => {
                const st = comandaState(c);
                const remaining = c.remaining_cents ?? c.total_cents;
                return (
                  <button key={c.id} onClick={() => setOpenComandaId(c.id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors">
                    <div className="min-w-0">
                      <div className="font-semibold flex items-center gap-2">
                        {c.customer}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stateBadge[st]}`}>
                          {stateLabel[st]}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="size-3" /> aberta há {elapsed(c.created_at)}
                        {c.status === "partial" && (
                          <span className="text-amber-400"> · já pagou {fmt(c.paid_cents ?? 0)}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">falta</div>
                      <div className="text-lg font-bold text-red-400">{fmt(remaining)}</div>
                    </div>
                  </button>
                );
              })}
            </Card>
          </section>
        )}

        {/* TODAS AS COMANDAS ABERTAS (cards coloridos) */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Comandas Abertas
          </h2>
          {comandas.isLoading ? (
            <Card className="p-8 text-center text-muted-foreground"><Loader2 className="size-6 mx-auto animate-spin" /></Card>
          ) : active.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <Receipt className="size-8 mx-auto mb-2 opacity-50" />
              Nenhuma comanda aberta. Crie a primeira abaixo.
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {active.map((c: Comanda) => {
                const st = comandaState(c);
                const remaining = c.remaining_cents ?? c.total_cents;
                return (
                  <button key={c.id} onClick={() => setOpenComandaId(c.id)} className="text-left">
                    <Card className={`p-4 h-full border-2 transition-colors hover:brightness-110 ${stateStyles[st]}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{c.customer}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="size-3" /> {elapsed(c.created_at)} · {c.item_count ?? 0} ite{(c.item_count ?? 0) === 1 ? "m" : "ns"}
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${stateBadge[st]}`}>
                          {stateLabel[st]}
                        </span>
                      </div>
                      <div className="mt-3 flex items-end justify-between">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</div>
                          <div className="text-base font-semibold">{fmt(c.total_cents)}</div>
                        </div>
                        {c.status === "partial" && (
                          <div className="text-right">
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Falta</div>
                            <div className="text-base font-bold text-amber-400">{fmt(remaining)}</div>
                          </div>
                        )}
                      </div>
                    </Card>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* HISTÓRICO PAGAS */}
        {paid.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Histórico (Pagas)
            </h2>
            <Card className="divide-y divide-border">
              {paid.slice(0, 10).map((c: Comanda) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                    <div>
                      <div className="font-medium">{c.customer}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.paid_at && new Date(c.paid_at).toLocaleString("pt-BR")}
                        {c.payment_method ? ` · ${c.payment_method}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="font-bold">{fmt(c.total_cents)}</div>
                    {user?.role === "admin" && (
                      <Button size="icon" variant="ghost" onClick={() => removeComanda.mutate(c.id)}>
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          </section>
        )}

        {/* NOVA COMANDA */}
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="Nome do cliente para nova comanda..." value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newName.trim() && createComanda.mutate(newName.trim())}
              className="flex-1" />
            <Button onClick={() => newName.trim() && createComanda.mutate(newName.trim())}
              size="lg" disabled={createComanda.isPending}>
              <Plus className="size-4 mr-1" /> Nova Comanda
            </Button>
          </div>
        </Card>
      </main>

      {/* DIALOG DA COMANDA */}
      <Dialog open={!!openComandaId} onOpenChange={(o) => !o && setOpenComandaId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    Comanda — <span className="text-primary">{detail.customer}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stateBadge[comandaState(detail)]}`}>
                      {stateLabel[comandaState(detail)]}
                    </span>
                  </span>
                  {user?.role === "admin" && (
                    <Button size="icon" variant="ghost" onClick={() => removeComanda.mutate(detail.id)} title="Excluir comanda">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </DialogTitle>
              </DialogHeader>

              <div className="grid md:grid-cols-2 gap-4 flex-1 overflow-hidden">
                <div className="flex flex-col overflow-hidden">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Adicionar Produto</div>
                  <div className="overflow-auto pr-1 space-y-1.5">
                    {productList.map((p: Product) => (
                      <button key={p.id} onClick={() => addItem.mutate({ id: detail.id, productId: p.id })}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-secondary hover:bg-primary hover:text-primary-foreground transition-colors text-left">
                        <span className="text-sm font-medium">{p.name}</span>
                        <span className="text-sm font-semibold">{fmt(p.price_cents)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col overflow-hidden">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Itens da Comanda</div>
                  <div className="overflow-auto flex-1 border border-border rounded-md">
                    {(detail.items?.length ?? 0) === 0 ? (
                      <div className="p-6 text-center text-sm text-muted-foreground">Nenhum item ainda.</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {detail.items!.map((i) => (
                          <div key={i.id} className="flex items-center gap-2 px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{i.name}</div>
                              <div className="text-xs text-muted-foreground">{fmt(i.price_cents)} cada</div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button size="icon" variant="outline" className="size-7"
                                onClick={() => setQty.mutate({ id: detail.id, itemId: i.id, qty: i.qty - 1 })}>−</Button>
                              <span className="w-8 text-center font-semibold">{i.qty}</span>
                              <Button size="icon" variant="outline" className="size-7"
                                onClick={() => setQty.mutate({ id: detail.id, itemId: i.id, qty: i.qty + 1 })}>+</Button>
                            </div>
                            <div className="w-20 text-right font-semibold text-sm">{fmt(i.price_cents * i.qty)}</div>
                            <Button size="icon" variant="ghost" className="size-7"
                              onClick={() => setQty.mutate({ id: detail.id, itemId: i.id, qty: 0 })}>
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {(detail.paid_cents ?? 0) > 0 && (
                    <div className="mt-2 text-xs flex justify-between text-muted-foreground">
                      <span>Já pago: <span className="text-emerald-400 font-semibold">{fmt(detail.paid_cents ?? 0)}</span></span>
                      <span>Falta: <span className="text-amber-400 font-semibold">{fmt(detail.remaining_cents ?? 0)}</span></span>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="border-t border-border pt-4 flex flex-col gap-3">
                <div className="flex items-center justify-between w-full">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {(detail.paid_cents ?? 0) > 0 ? "Saldo a pagar" : "Total"}
                    </div>
                    <div className="text-3xl font-bold text-primary">
                      {fmt(detail.remaining_cents ?? detail.total_cents)}
                    </div>
                  </div>
                  {canManage && (
                    <Select value={payMethod} onValueChange={setPayMethod}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="pix">Pix</SelectItem>
                        <SelectItem value="cartao">Cartão</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {canManage ? (
                  <div className="flex flex-col sm:flex-row gap-2 w-full">
                    <div className="flex gap-2 flex-1">
                      <Input placeholder="Valor parcial (R$)" value={partialValue}
                        onChange={(e) => setPartialValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && doPartial()}
                        disabled={(detail.items?.length ?? 0) === 0} />
                      <Button variant="secondary" onClick={doPartial}
                        disabled={(detail.items?.length ?? 0) === 0 || pay.isPending || !partialValue}>
                        Pagar parte
                      </Button>
                    </div>
                    <Button size="lg" className="bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={(detail.items?.length ?? 0) === 0 || pay.isPending}
                      onClick={() => pay.mutate({ id: detail.id, method: payMethod })}>
                      <CheckCircle2 className="size-5 mr-2" /> QUITAR TUDO
                    </Button>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground w-full text-center">
                    Pagamento somente pelo caixa.
                  </div>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <footer className="border-t border-border mt-12">
        <div className="max-w-7xl mx-auto px-4 py-4 text-xs text-muted-foreground text-center">
          Atacadão Cervejaria · Sistema de Comandas
        </div>
      </footer>
    </div>
  );
}
