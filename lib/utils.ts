import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(nameOrEmail: string) {
  const source = nameOrEmail.trim();
  if (!source) {
    return "U";
  }

  const words = source.includes("@") ? source.split("@")[0].split(/[._-]/) : source.split(" ");
  return words
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

export function formatDate(date: string | null | undefined) {
  if (!date) {
    return "Non défini";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}

export function formatDateTime(date: string | null | undefined) {
  if (!date) {
    return "Non défini";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(date));
}

export function parseCommaList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function emptyDoc() {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph"
      }
    ]
  };
}
