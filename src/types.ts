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

export interface WebhookPayload {
  orders: SiteOrder[];
}
