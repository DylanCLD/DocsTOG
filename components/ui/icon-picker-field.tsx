"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type IconOption = {
  icon: string;
  label: string;
  keywords: string;
  category: string;
};

const iconOptions: IconOption[] = [
  { icon: "📄", label: "Page", keywords: "page document note papier", category: "Documents" },
  { icon: "📁", label: "Dossier", keywords: "dossier gestionnaire folder", category: "Documents" },
  { icon: "📝", label: "Notes", keywords: "note texte ecriture", category: "Documents" },
  { icon: "📚", label: "Bibliotheque", keywords: "docs livres wiki", category: "Documents" },
  { icon: "📌", label: "Epingle", keywords: "important pinned", category: "Documents" },
  { icon: "✅", label: "Checklist", keywords: "todo tache check", category: "Documents" },
  { icon: "⚙️", label: "Systeme", keywords: "systeme mecanique config", category: "Projet" },
  { icon: "🎮", label: "Game Design", keywords: "jeu gameplay design", category: "Projet" },
  { icon: "⚖️", label: "Equilibrage", keywords: "balance equilibrage valeur", category: "Projet" },
  { icon: "🧭", label: "Quetes", keywords: "quete objectif mission", category: "Projet" },
  { icon: "👑", label: "Boss", keywords: "boss roi combat", category: "Projet" },
  { icon: "🎒", label: "Items", keywords: "item objet inventaire", category: "Projet" },
  { icon: "🗺️", label: "Maps", keywords: "map carte monde zone", category: "Projet" },
  { icon: "🧩", label: "UI UX", keywords: "interface ux ui puzzle", category: "Projet" },
  { icon: "💡", label: "Idee", keywords: "idee inspiration lumiere", category: "Projet" },
  { icon: "🐞", label: "Bug", keywords: "bug erreur correction", category: "Projet" },
  { icon: "📜", label: "Lore", keywords: "lore histoire parchemin", category: "Projet" },
  { icon: "🛡️", label: "Defense", keywords: "shield armure protection", category: "Gameplay" },
  { icon: "⚔️", label: "Combat", keywords: "combat epee attaque", category: "Gameplay" },
  { icon: "🏹", label: "Distance", keywords: "arc distance ranged", category: "Gameplay" },
  { icon: "🪄", label: "Magie", keywords: "magie sort spell", category: "Gameplay" },
  { icon: "💰", label: "Economie", keywords: "argent monnaie economie", category: "Gameplay" },
  { icon: "🔨", label: "Craft", keywords: "craft forge outil", category: "Gameplay" },
  { icon: "🧪", label: "Potion", keywords: "potion alchimie test", category: "Gameplay" },
  { icon: "📈", label: "Progression", keywords: "stats progression courbe", category: "Gameplay" },
  { icon: "🌲", label: "Foret", keywords: "foret nature biome", category: "Monde" },
  { icon: "🏔️", label: "Montagne", keywords: "montagne biome neige", category: "Monde" },
  { icon: "🏜️", label: "Desert", keywords: "desert sable biome", category: "Monde" },
  { icon: "🌊", label: "Ocean", keywords: "eau mer ocean", category: "Monde" },
  { icon: "🏰", label: "Chateau", keywords: "chateau ville fort", category: "Monde" },
  { icon: "🕳️", label: "Donjon", keywords: "donjon cave souterrain", category: "Monde" },
  { icon: "🚪", label: "Portail", keywords: "porte portail acces", category: "Monde" },
  { icon: "🔥", label: "Feu", keywords: "feu danger chaud", category: "Etat" },
  { icon: "❄️", label: "Glace", keywords: "glace froid neige", category: "Etat" },
  { icon: "⚡", label: "Eclair", keywords: "eclair energie rapide", category: "Etat" },
  { icon: "🩸", label: "Danger", keywords: "danger degat sang", category: "Etat" },
  { icon: "🔒", label: "Verrouille", keywords: "lock prive securite", category: "Etat" },
  { icon: "🔓", label: "Ouvert", keywords: "unlock ouvert acces", category: "Etat" },
  { icon: "⭐", label: "Important", keywords: "favori star important", category: "Etat" },
  { icon: "🚧", label: "Travaux", keywords: "wip chantier construction", category: "Etat" }
];

const categories = ["Tous", ...Array.from(new Set(iconOptions.map((option) => option.category)))];

export function IconPickerField({
  name = "icon",
  label = "Icone",
  defaultValue = "📄",
  disabled = false,
  className
}: {
  name?: string;
  label?: string;
  defaultValue?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tous");

  const filteredIcons = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return iconOptions.filter((option) => {
      const matchesCategory = category === "Tous" || option.category === category;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        `${option.label} ${option.keywords} ${option.category}`.toLowerCase().includes(normalizedQuery);

      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  return (
    <div className={cn("relative", className)}>
      <input type="hidden" name={name} value={value} />
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</span>

      <details className="group">
        <summary
          className={cn(
            "flex h-10 cursor-pointer list-none items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none transition focus-visible:border-[var(--accent)]",
            disabled && "pointer-events-none opacity-55"
          )}
        >
          <span className="flex items-center gap-2">
            <span className="text-xl leading-none">{value}</span>
            <span className="text-[var(--muted)]">Choisir</span>
          </span>
          <span className="text-xs text-[var(--muted)]">⌄</span>
        </summary>

        <div className="absolute left-0 right-0 z-40 mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-2xl shadow-black/30 md:w-[28rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher une icone..."
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
                  category === item
                    ? "border-[var(--accent)] bg-emerald-400/10 text-emerald-200"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-elevated)]"
                )}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="mt-3 grid max-h-64 grid-cols-8 gap-2 overflow-y-auto pr-1">
            {filteredIcons.map((option) => (
              <button
                key={`${option.category}-${option.label}-${option.icon}`}
                type="button"
                title={option.label}
                onClick={() => setValue(option.icon)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-lg border text-xl transition hover:-translate-y-0.5 hover:bg-[var(--surface-elevated)]",
                  value === option.icon ? "border-[var(--accent)] bg-emerald-400/10" : "border-[var(--border)]"
                )}
              >
                {option.icon}
              </button>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
