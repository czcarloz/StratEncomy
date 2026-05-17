"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/auth";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (auth.getToken()) {
      router.replace("/transactions");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return null;
}
