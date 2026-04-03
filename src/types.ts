export interface SiteOrder {
  externalOrderId: string;
  externalCustomerId: string;
  orderStatus: number;
  paymentStatus: number;
  totalCost: number;
  status: string;
  date: number;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  currency: string;
  shipping: string | null;
  discount: number;
  statusDescription: string;
  deliveryMethod: string;
  paymentMethod: string;
  deliveryAddress: string;
  additionalInfo: string;
  items: Array<{
    externalItemId?: number;
    sku?: string;
    name: string;
    category: string;
    quantity: number;
    cost: number;
    url: string;
    imageUrl: string;
    description: string;
  }>;
}

export type OrderStatusHistoryEntry = {
  status: string;
  date: number;
  crm_response?: any;
  error_message?: string;
  retry_count?: number;
};

export interface OrderMapping {
  _rowid: string; // Unique identifier for the order
  site_order: SiteOrder;
  crm_order?: any;
  status_history: OrderStatusHistoryEntry[];
  current_status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: number;
  updated_at: number;
  queue_meta?: {
    retry_at?: number | null;
    is_delayed_lead?: boolean;
    delay_minutes?: number | null;
  };
}

export interface WebhookPayload {
  orders: SiteOrder[];
}
