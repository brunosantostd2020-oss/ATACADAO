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

  const totalDevido = comanda.remaining_cents ?? comanda.total_cents;

  const itensList = (comanda.items ?? [])
    .map((i) => {
      const dataItem = i.created_at
        ? new Date(i.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
        : null;
      const horaItem = i.created_at
        ? new Date(i.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : null;
      const quando = dataItem ? ` (${dataItem} às ${horaItem})` : "";
      return `- ${i.qty}x ${i.name}${i.notes ? ` (${i.notes})` : ""}${quando}`;
    })
    .join("\n");

  const linhas: string[] = [];

  linhas.push(`${g}, ${comanda.customer}.`);
  linhas.push(``);
  linhas.push(`Entramos em contato para informar que identificamos um valor em aberto referente ao seu consumo no Atacadão Cervejaria, realizado em ${data} às ${hora}.`);
  linhas.push(``);

  if (itensList) {
    linhas.push(`Itens consumidos:`);
    linhas.push(itensList);
    linhas.push(``);
  }

  linhas.push(`Total da comanda: ${fmt(comanda.total_cents)}`);

  if ((comanda.paid_cents ?? 0) > 0) {
    linhas.push(`Valor já pago: ${fmt(comanda.paid_cents ?? 0)}`);
  }

  linhas.push(`Valor em aberto: ${fmt(totalDevido)}`);
  linhas.push(``);
  linhas.push(`Pedimos gentileza em regularizar assim que possível, seja pelo contato conosco ou comparecendo ao estabelecimento.`);
  linhas.push(``);
  linhas.push(`Agradecemos a compreensão e ficamos à disposição.`);
  linhas.push(`Atacadão Cervejaria`);

  const msg = linhas.join("\n");

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
