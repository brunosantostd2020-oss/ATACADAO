import type { Comanda } from "./client";

/** Retorna a saudação certa pelo horário atual */
function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

function fmt(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Gera o link wa.me com a mensagem de cobrança já preenchida.
 * Abre o WhatsApp direto no número do cliente.
 */
export function whatsappCobrancaUrl(comanda: Comanda): string {
  const g = greeting();
  const data = new Date(comanda.created_at).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const hora = new Date(comanda.created_at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const itens = (comanda.items ?? [])
    .map((i) => `  • ${i.qty}x ${i.name}${i.notes ? ` (${i.notes})` : ""}`)
    .join("\n");

  const totalDevido = comanda.remaining_cents ?? comanda.total_cents;
  const parcial = (comanda.paid_cents ?? 0) > 0
    ? `\nValor já pago: ${fmt(comanda.paid_cents ?? 0)}`
    : "";

  const msg = [
    `${g}, Sr./Sra. *${comanda.customer}*!`,
    ``,
    `Passando para informar que consta em nosso sistema uma pendência financeira referente ao consumo realizado no *Atacadão Cervejaria*.`,
    ``,
    `📋 *Detalhes da comanda:*`,
    `Data: ${data} às ${hora}`,
    itens ? `Itens consumidos:\n${itens}` : "",
    ``,
    `💰 *Valor total: ${fmt(comanda.total_cents)}*${parcial}`,
    `🔴 *Valor em aberto: ${fmt(totalDevido)}*`,
    ``,
    `Por favor, entre em contato para realizar o pagamento ou compareça ao estabelecimento.`,
    ``,
    `Agradecemos a compreensão!`,
    `*Atacadão Cervejaria*`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  // Remove caracteres inválidos do telefone (só dígitos)
  const phone = (comanda.phone ?? "").replace(/\D/g, "");
  // Garante código do país (55 = Brasil)
  const fullPhone = phone.startsWith("55") ? phone : `55${phone}`;

  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
}

/** Abre o WhatsApp diretamente — usa deep link nativo no celular */
export function openWhatsapp(comanda: Comanda) {
  const url = whatsappCobrancaUrl(comanda);
  // No celular, tenta abrir o app nativo via deep link
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    const phone = (comanda.phone ?? "").replace(/\D/g, "");
    const fullPhone = phone.startsWith("55") ? phone : `55${phone}`;
    const msg = new URL(url).searchParams.get("text") ?? "";
    // Deep link nativo do WhatsApp — abre direto no app sem perguntar
    window.location.href = `whatsapp://send?phone=${fullPhone}&text=${encodeURIComponent(msg)}`;
  } else {
    window.open(url, "_blank");
  }
}
