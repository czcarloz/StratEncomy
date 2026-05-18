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

export interface CreditCard {
  id: number;
  tenant_id: number;
  name: string;
  closing_day: number;
  due_day: number;
  limit: string | null;
  created_at: string;
}

export interface CreditCardPurchase {
  id: number;
  card_id: number;
  tenant_id: number;
  description: string;
  total_amount: string;
  installments: number;
  purchase_date: string;
  created_by: number;
  created_at: string;
}

export interface InvoiceItem {
  purchase_id: number;
  description: string;
  purchase_date: string;
  installment_number: number;
  installments: number;
  installment_amount: string;
}

export interface Invoice {
  card_id: number;
  month: number;
  year: number;
  total: string;
  items: InvoiceItem[];
}

export interface CategoryBreakdown {
  category_id: number;
  name: string;
  amount: string;
  percentage: number;
}

export interface MonthTotals {
  total_income: string;
  total_expense: string;
  total_investment: string;
  balance: string;
}

export interface DashboardSummary {
  month: number;
  year: number;
  total_income: string;
  total_expense: string;
  total_investment: string;
  balance: string;
  expense_by_category: CategoryBreakdown[];
  prev_month: MonthTotals;
}

export interface MonthlyPoint {
  month: number;
  total_income: string;
  total_expense: string;
  total_investment: string;
  balance: string;
}

export interface PlannedInvestment {
  id: number;
  tenant_id: number;
  month: number;
  year: number;
  asset_label: string;
  amount_planned: string;
  note: string | null;
  created_by: number;
  created_at: string;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  tenant_id: number | null;
  action: string;
  entity: string | null;
  entity_id: number | null;
  payload_json: Record<string, unknown> | null;
  ip: string | null;
  ts: string;
}
