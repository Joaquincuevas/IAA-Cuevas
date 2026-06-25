"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TrazabilidadRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard/conexiones"); }, [router]);
  return null;
}
