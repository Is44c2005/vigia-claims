import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const COLORS = {
  Rojo:     "#e63946",
  Amarillo: "#f4a261",
  Verde:    "#57cc99",
} as const;

export function semColorClass(sem: string) {
  if (sem === "Rojo")     return "text-rojo font-bold";
  if (sem === "Amarillo") return "text-amarillo font-bold";
  return "text-verde font-bold";
}

export function semBgClass(sem: string) {
  if (sem === "Rojo")     return "bg-red-900/40 text-red-300";
  if (sem === "Amarillo") return "bg-orange-900/40 text-orange-300";
  return "bg-green-900/40 text-green-300";
}

export function fmt(n: number | undefined | null, decimals = 0) {
  if (n == null) return "—";
  return n.toLocaleString("es-EC", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtMoney(n: number | undefined | null) {
  if (n == null) return "—";
  return "$" + n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPct(n: number | undefined | null) {
  if (n == null) return "—";
  return (n * 100).toFixed(1) + "%";
}
