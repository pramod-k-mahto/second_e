"use client";

/**
 * Utility for Restaurant POS
 */

// --- ESC/POS Printing ---

export interface PrintData {
  companyName: string;
  customerName: string;
  invoiceNumber?: string | null;
  table?: string | null;
  orderType: string;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  tax: number;
  total: number;
  date: string;
}

export const generateEscPos = (data: PrintData) => {
  const width = 32; // Standard for 58mm printers
  const line = "-".repeat(width) + "\n";
  
  // Helper to center text
  const centerText = (text: string) => {
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    return " ".repeat(padding) + text + "\n";
  };

  let output = centerText(data.companyName.toUpperCase());
  output += centerText(data.orderType === "DELIVERY" ? "DELIVERY BOOKING NOTE" : "SALES RECEIPT");
  output += line;
  
  output += `Customer: ${data.customerName}\n`;
  if (data.invoiceNumber) {
    output += `Bill No : ${data.invoiceNumber}\n`;
  }
  output += `Date    : ${data.date}\n`;
  output += `Type    : ${data.orderType}\n`;
  output += line;
  
  output += `Item           Qty  Rate  Total\n`;
  output += line;
  
  data.items.forEach(item => {
    // Standard row: Item Name (12 chars) Qty(4) Rate(7) Total(7)
    const itemName = item.name.padEnd(width).slice(0, 14);
    const qty = String(item.quantity).padStart(3);
    const rate = item.price.toFixed(0).padStart(6);
    const total = (item.quantity * item.price).toFixed(0).padStart(7);
    
    output += `${itemName}\n`;
    output += `               ${qty} x ${rate} ${total}\n`;
  });

  output += line;
  output += `SUBTOTAL: ${data.subtotal.toFixed(2).padStart(22)}\n`;
  output += `TAX (13%): ${data.tax.toFixed(2).padStart(21)}\n`;
  output += `TOTAL: ${data.total.toFixed(2).padStart(25)}\n`;
  output += line;
  output += centerText("Thank you!");
  output += centerText("Visit Again");
  
  return output;
};

export const printToThermal = (content: string) => {
  // In a real browser, this might use a Web Serial/Web Bluetooth API or a local gateway
  // For now, we'll open a print window with a dedicated raw text style
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(`
      <html>
        <head>
          <title>POS Receipt</title>
          <style>
            @media print {
              body { margin: 0; padding: 0; width: 58mm; overflow: hidden; }
              pre { font-family: 'Courier New', Courier, monospace; font-size: 10px; line-height: 1.2; white-space: pre-wrap; margin: 0; }
            }
            body { font-family: monospace; padding: 10px; width: 58mm; margin: 0 auto; }
            pre { white-space: pre-wrap; font-size: 10px; line-height: 1.2; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <pre>${content}</pre>
        </body>
      </html>
    `);
    printWindow.document.close();
  }
};

// --- Offline Sync ---

const OFFLINE_ORDERS_KEY = 'pos_offline_orders';

export const saveOrderOffline = (order: any) => {
  const existing = localStorage.getItem(OFFLINE_ORDERS_KEY);
  const orders = existing ? JSON.parse(existing) : [];
  orders.push({ ...order, id: Date.now(), status: 'pending_sync' });
  localStorage.setItem(OFFLINE_ORDERS_KEY, JSON.stringify(orders));
};

export const getPendingOrders = () => {
  const existing = localStorage.getItem(OFFLINE_ORDERS_KEY);
  return existing ? JSON.parse(existing) : [];
};

export const clearSyncedOrder = (id: number) => {
  const existing = localStorage.getItem(OFFLINE_ORDERS_KEY);
  if (!existing) return;
  const orders = JSON.parse(existing).filter((o: any) => o.id !== id);
  localStorage.setItem(OFFLINE_ORDERS_KEY, JSON.stringify(orders));
};
