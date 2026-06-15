import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Plus, Trash2, Users, Phone,
  MessageCircle, LogOut, Search, Clock, X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/api/auth";
import { LoginScreen } from "@/components/LoginScreen";
import { customersApi, type Customer } from "@/lib/api/client";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Atacadão Cervejaria" }] }),
  component: CustomersPage,
});

function CustomersPage() {
  const { user, loading, logout } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center"><div className="animate-spin size-6 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (!user) return <LoginScreen />;
  return <CustomersDashboard logout={logout} />;
}

function CustomersDashboard({ logout }: { logout: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [newForm, setNewForm] = useState({ name: "", phone: "", notes: "" });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", notes: "" });
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);

  const customers = useQuery({ queryKey: ["customers"], queryFn: customersApi.list });
  const history = useQuery({
    queryKey: ["customer-history", historyCustomer?.id],
    queryFn: () => customersApi.history(historyCustomer!.id),
    enabled: !!historyCustomer,
  });

  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro.");

  const create = useMutation({
    mutationFn: () => customersApi.create({
      name: newForm.name.trim(),
      phone: newForm.phone.trim() || undefined,
      notes: newForm.notes.trim() || undefined,
    }),
    onSuccess: () => {
      setNewForm({ name: "", phone: "", notes: "" });
      setFormOpen(false);
      toast.success("Cliente cadastrado!");
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError,
  });

  const update = useMutation({
    mutationFn: () => customersApi.update(editing!.id, {
      name: editForm.name.trim(),
      phone: editForm.phone.trim() || undefined,
      notes: editForm.notes.trim() || undefined,
    }),
    onSuccess: () => {
      setEditing(null);
      toast.success("Cliente atualizado!");
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => customersApi.remove(id),
    onSuccess: () => {
      toast.success("Cliente removido.");
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError,
  });

  const all = customers.data ?? [];
  const filtered = search.trim()
    ? all.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone ?? "").includes(search))
    : all;

  const fmt = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const startEdit = (c: Customer) => {
    setEditing(c);
    setEditForm({ name: c.name, phone: c.phone ?? "", notes: c.notes ?? "" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link to="/"><Button variant="ghost" size="icon"><ArrowLeft className="size-4" /></Button></Link>
            <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Users className="size-4" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-none">CLIENTES</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{all.length} cadastrado{all.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="size-3.5 mr-1" /> Novo
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}><LogOut className="size-4" /></Button>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou telefone..." className="pl-8"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-2">
        {customers.isLoading ? (
          <Card className="p-8 text-center text-muted-foreground">Carregando...</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            <Users className="size-8 mx-auto mb-2 opacity-40" />
            {search ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado ainda."}
            {!search && <div className="mt-2"><Button size="sm" onClick={() => setFormOpen(true)}><Plus className="size-3.5 mr-1" /> Cadastrar primeiro cliente</Button></div>}
          </Card>
        ) : (
          filtered.map((c) => (
            <Card key={c.id} className={`px-4 py-3 ${(c.total_devendo_cents ?? 0) > 0 ? "border-red-500/40 bg-red-500/5" : ""}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{c.name}</span>
                    {(c.total_devendo_cents ?? 0) > 0 && (
                      <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold">
                        DEVE {fmt(c.total_devendo_cents ?? 0)}
                      </span>
                    )}
                    {(c.notes) && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded max-w-40 truncate">
                        {c.notes}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    {c.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" /> {c.phone}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" /> {c.visit_count} visita{c.visit_count !== 1 ? "s" : ""}
                    </span>
                    {c.last_visit && (
                      <span>última: {new Date(c.last_visit).toLocaleDateString("pt-BR")}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* WhatsApp — só se tiver telefone e estiver devendo */}
                  {c.phone && (c.total_devendo_cents ?? 0) > 0 && (
                    <a
                      href={`https://wa.me/55${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Boa ${new Date().getHours() < 12 ? "dia" : new Date().getHours() < 18 ? "tarde" : "noite"}, Sr./Sra. *${c.name}*!\n\nPassando para informar que consta em nosso sistema uma pendência financeira no *Atacadão Cervejaria*.\n\n💰 *Valor em aberto: ${fmt(c.total_devendo_cents ?? 0)}*\n\nPor favor, entre em contato para regularizar.\n\n*Atacadão Cervejaria*`)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="size-8 rounded-full bg-[#25D366] text-white grid place-items-center hover:bg-[#20b558] transition-colors"
                      title="Cobrar via WhatsApp">
                      <MessageCircle className="size-4" />
                    </a>
                  )}
                  <Button size="icon" variant="ghost" className="size-8"
                    onClick={() => setHistoryCustomer(c)} title="Histórico">
                    <Clock className="size-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8"
                    onClick={() => startEdit(c)} title="Editar">
                    <span className="text-xs">✏️</span>
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8"
                    onClick={() => remove.mutate(c.id)} title="Excluir">
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </main>

      {/* Dialog novo cliente */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Novo Cliente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input placeholder="Nome do cliente" value={newForm.name}
                onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && create.mutate()} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone (WhatsApp)</Label>
              <Input placeholder="Ex: 37999887766" inputMode="tel" value={newForm.phone}
                onChange={(e) => setNewForm((f) => ({ ...f, phone: e.target.value }))} />
              <p className="text-xs text-muted-foreground">DDD + número, sem espaços</p>
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Input placeholder="Ex: cliente VIP, sempre paga no pix..." value={newForm.notes}
                onChange={(e) => setNewForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={() => create.mutate()}
              disabled={!newForm.name.trim() || create.isPending}>
              Cadastrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog editar cliente */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Editar — {editing?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input placeholder="Ex: 37999887766" inputMode="tel" value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Input placeholder="Ex: cliente VIP..." value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={() => update.mutate()}
              disabled={!editForm.name.trim() || update.isPending}>
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog histórico */}
      <Dialog open={!!historyCustomer} onOpenChange={(o) => !o && setHistoryCustomer(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Histórico — {historyCustomer?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-72 overflow-auto space-y-1.5">
            {history.isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
            ) : (history.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sem comandas ainda.</p>
            ) : (
              history.data!.map((cmd) => {
                const total = cmd.total_cents ?? 0;
                const paid = cmd.paid_cents ?? 0;
                const owing = Math.max(0, total - paid);
                return (
                  <div key={cmd.id} className={`flex items-center justify-between px-3 py-2 rounded-md border ${owing > 0 ? "border-red-500/30 bg-red-500/5" : "border-border"}`}>
                    <div>
                      <div className="text-xs font-semibold">{new Date(cmd.created_at).toLocaleDateString("pt-BR")}</div>
                      <div className="text-xs text-muted-foreground capitalize">{cmd.status}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">{fmt(total)}</div>
                      {owing > 0 && <div className="text-xs text-red-400">deve {fmt(owing)}</div>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
