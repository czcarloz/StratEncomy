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

export type AssetClass = "stock" | "fii" | "etf" | "bdr" | "bond" | "crypto" | "other";
export type OperationType = "buy" | "sell";

export interface Portfolio {
  id: number;
  tenant_id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Asset {
  id: number;
  portfolio_id: number;
  tenant_id: number;
  ticker: string;
  name: string | null;
  asset_class: AssetClass;
  currency: string;
  created_at: string;
}

export interface Operation {
  id: number;
  asset_id: number;
  portfolio_id: number;
  tenant_id: number;
  type: OperationType;
  quantity: string;
  unit_price: string;
  total_amount: string;
  date: string;
  broker: string | null;
  note: string | null;
  created_at: string;
}

export interface Dividend {
  id: number;
  asset_id: number;
  portfolio_id: number;
  tenant_id: number;
  amount: string;
  date: string;
  note: string | null;
  created_at: string;
}

export interface AssetPosition {
  asset_id: number;
  ticker: string;
  name: string | null;
  asset_class: AssetClass;
  currency: string;
  quantity: string;
  avg_price: string;
  total_invested: string;
  total_dividends: string;
}

export interface PortfolioPosition {
  portfolio_id: number;
  name: string;
  total_invested: string;
  total_dividends: string;
  positions: AssetPosition[];
}

export interface B3ParsedOperation {
  ticker: string;
  op_type: "buy" | "sell";
  quantity: string;
  unit_price: string;
  date: string;
  broker: string | null;
}

export interface B3ParsedDividend {
  ticker: string;
  amount: string;
  date: string;
  note: string | null;
}

export interface B3PreviewResult {
  operations: B3ParsedOperation[];
  dividends: B3ParsedDividend[];
  skipped_count: number;
  skipped_reasons: string[];
}

export interface B3ConfirmResult {
  operations_created: number;
  dividends_created: number;
  assets_created: number;
}

export interface MonthlySnapshot {
  year: number;
  month: number;
  total_invested: string;
  market_value: string;
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
