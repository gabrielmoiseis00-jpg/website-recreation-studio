export type Theme = { dark: boolean; hue: number };
const TKEY = "agend_theme";
export const CORES = [
  { nome: "Azul", hue: 262 },
  { nome: "Verde", hue: 150 },
  { nome: "Turquesa", hue: 195 },
  { nome: "Roxo", hue: 300 },
  { nome: "Rosa", hue: 350 },
  { nome: "Vermelho", hue: 25 },
  { nome: "Laranja", hue: 55 },
];
export function getTheme(): Theme {
  try { return { dark: false, hue: 262, ...JSON.parse(localStorage.getItem(TKEY) || "{}") }; } catch { return { dark: false, hue: 262 }; }
}
export function applyTheme(t: Theme = getTheme()) {
  const r = document.documentElement;
  r.classList.toggle("dark", t.dark);
  const h = t.hue;
  r.style.setProperty("--primary", t.dark ? `oklch(0.65 0.18 ${h})` : `oklch(0.5 0.21 ${h})`);
  r.style.setProperty("--primary-foreground", "oklch(0.99 0 0)");
  r.style.setProperty("--sidebar", t.dark ? `oklch(0.24 0.06 ${h})` : `oklch(0.42 0.22 ${h})`);
  r.style.setProperty("--accent", t.dark ? `oklch(0.3 0.05 ${h})` : `oklch(0.94 0.03 ${h})`);
  r.style.setProperty("--ring", `oklch(0.6 0.12 ${h})`);
}
export function setTheme(t: Theme) {
  localStorage.setItem(TKEY, JSON.stringify(t));
  applyTheme(t);
}
