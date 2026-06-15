import type { ComandaItem } from "./client";

export interface KitchenTicket {
  customer: string;
  items: ComandaItem[];
  printedAt: Date;
}

/**
 * Gera o HTML da comanda de cozinha otimizado para impressora termica 80mm.
 * Abre uma janela de impressao do navegador e imprime automaticamente.
 */
export function printKitchenTicket(ticket: KitchenTicket) {
  const hora = ticket.printedAt.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const data = ticket.printedAt.toLocaleDateString("pt-BR");

  const itensHtml = ticket.items
    .map(
      (item) => `
      <div class="item">
        <div class="item-qty">${item.qty}x</div>
        <div class="item-info">
          <div class="item-name">${item.name}</div>
          ${item.notes ? `<div class="item-notes">⚠ ${item.notes}</div>` : ""}
        </div>
      </div>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Cozinha</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      width: 72mm;
      padding: 4mm;
      background: white;
      color: black;
    }

    .header {
      text-align: center;
      border-bottom: 2px dashed #000;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }

    .logo {
      font-size: 16px;
      font-weight: bold;
      letter-spacing: 1px;
    }

    .label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-top: 2px;
    }

    .cliente {
      font-size: 18px;
      font-weight: bold;
      text-align: center;
      padding: 8px 0;
      border-bottom: 1px dashed #000;
      margin-bottom: 8px;
      text-transform: uppercase;
    }

    .item {
      display: flex;
      gap: 8px;
      align-items: baseline;
      padding: 5px 0;
      border-bottom: 1px dotted #ccc;
      font-size: 15px;
    }

    .item-qty {
      font-size: 20px;
      font-weight: bold;
      min-width: 28px;
      text-align: right;
    }

    .item-info { flex: 1; }

    .item-name {
      font-size: 15px;
      font-weight: bold;
    }

    .item-notes {
      font-size: 12px;
      font-weight: bold;
      background: #000;
      color: #fff;
      padding: 1px 4px;
      margin-top: 2px;
      display: inline-block;
    }

    .footer {
      margin-top: 10px;
      font-size: 11px;
      text-align: center;
      color: #555;
      border-top: 1px dashed #000;
      padding-top: 6px;
    }

    @media print {
      @page {
        margin: 0;
        size: 80mm auto;
      }
      body { width: 72mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">ATACADAO CERVEJARIA</div>
    <div class="label">*** COZINHA ***</div>
  </div>

  <div class="cliente">${ticket.customer}</div>

  <div class="itens">
    ${itensHtml}
  </div>

  <div class="footer">
    ${data} &nbsp;|&nbsp; ${hora}
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 200);
    };
  </script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=400,height=500");
  if (!win) {
    alert("Permita popups para imprimir. Clique no ícone de bloqueio na barra do navegador.");
    return;
  }
  win.document.write(html);
  win.document.close();
}
