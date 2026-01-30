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
    externalItemId: number;
    name: string;
    category: string;
    quantity: number;
    cost: number;
    url: string;
    imageUrl: string;
    description: string;
  }>;
}

export interface OrderMapping {
  _rowid: string; // Unique identifier for the order
  site_order: SiteOrder;
  crm_order?: any;
  crm_pipeline_card?: any;
  status_history: Array<{
    status: 'pending' | 'processing' | 'completed' | 'failed';
    date: number;
    crm_response?: any;
    error_message?: string;
    retry_count?: number;
  }>;
  current_status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: number;
  updated_at: number;
}

export interface WebhookPayload {
  orders: SiteOrder[];
}
