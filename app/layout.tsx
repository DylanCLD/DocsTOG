import type { Metadata } from "next";
import { ThemeProvider } from "@/components/layout/theme-provider";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Workspace Projet",
  description: "Espace de gestion de projet pour jeu, serveur et équipe."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
