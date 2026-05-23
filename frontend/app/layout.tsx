import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";

export const metadata: Metadata = {
  title: "StratEncomy",
  description: "Financial Management & Investment Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="text-text antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
