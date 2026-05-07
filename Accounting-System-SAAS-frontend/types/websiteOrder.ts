export type WebsiteOrderCreate = {
  reference?: string;
  transaction_id?: string;
  payment_screenshot?: string;
  date?: string;
  customer: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    shipping_address_same_as_billing?: boolean;
    shipping_address?: string;
    shipping_phone?: string;
  };
  lines: Array<{
    item_id: number;
    quantity: number;
    rate: number;
    discount?: number;
    tax_rate: number;
  }>;
  options?: {
    auto_invoice?: boolean;
    invoice_payment_mode_id?: number | null;
    record_payment?: boolean;
    receipt_payment_mode_id?: number | null;
    notify_customer?: boolean;
    notify_channels?: Array<'EMAIL' | 'SMS' | 'WHATSAPP'>;
    notify_internal?: boolean;
  };
};

export type WebsiteOrderResult = {
  order_id: number;
  status: 'CREATED' | 'EXISTS';
  invoice_id?: number | null;
  invoice_number?: string | null;
  receipt_voucher_id?: number | null;
  outbound_message_ids: number[];
  total_amount?: number | null;
  tax_amount?: number | null;
  lines?: Array<{
    item_id: number;
    quantity: number;
    rate: number;
    discount: number;
    tax_rate: number;
  }> | null;
};
