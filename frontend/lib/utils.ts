import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: string | number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

export function formatDate(date: string): string {
  return new Date(date + "T12:00:00").toLocaleDateString("pt-BR");
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const TYPE_LABELS: Record<string, string> = {
  expense: "Expense",
  income: "Income",
  investment: "Investment",
};

export const TYPE_COLORS: Record<string, string> = {
  expense: "bg-red-900/40 text-red-400",
  income: "bg-green-900/40 text-green-400",
  investment: "bg-blue-900/40 text-blue-400",
};
