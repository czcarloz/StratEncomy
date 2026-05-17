export type UserRole = "admin" | "client";
export type TransactionType = "expense" | "income" | "investment";

export interface User {
  id: number;
  email: string;
  role: UserRole;
  is_active: boolean;
}

export interface Tenant {
  id: number;
  name: string;
  owner_user_id: number;
  is_active: boolean;
}

export interface Category {
  id: number;
  tenant_id: number;
  type: TransactionType;
  name: string;
  color: string | null;
}

export interface Transaction {
  id: number;
  tenant_id: number;
  category_id: number;
  type: TransactionType;
  amount: string;
  description: string | null;
  date: string;
  created_by: number;
  created_at: string;
}
