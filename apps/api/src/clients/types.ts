export interface Client {
  id: string;
  businessName: string;
  contactName: string | null;
  email: string;
  phone: string | null;
  billingAddress: string;
  taxId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientPage {
  data: Client[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface CreateClientInput {
  businessName: string;
  contactName?: string | null;
  email: string;
  phone?: string | null;
  billingAddress: string;
  taxId?: string | null;
}

export type UpdateClientInput = Partial<CreateClientInput>;

export interface ClientService {
  list(limit: number, offset: number): Promise<ClientPage>;
  create(input: CreateClientInput): Promise<Client>;
  findById(id: string): Promise<Client | null>;
  update(id: string, input: UpdateClientInput): Promise<Client | null>;
  delete(id: string): Promise<boolean>;
}
