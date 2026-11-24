/*
  Scribbles themes. Each is a full colour set for the app, and a smaller set the widgets use.
  bg = page, card = surfaces, ink = main text, soft = secondary text, accent = highlights,
  chip/chip2 = buttons & quiet fills, g1/g2 = the soft glows behind the page.
*/
export const THEMES = [
  { id: "cream", name: "Classic", dark: false, bg: "#F4F4F6", card: "#FFFFFF", ink: "#1C1C1E", soft: "#6E6E73", accent: "#E5484D", chip: "#FFFFFF", chip2: "#E9E9EE", g1: "#FDE3DC", g2: "#E3ECFB", tape: "#F2C94C" },
  { id: "royal", name: "Royal Purple", dark: false, bg: "#F3EEFB", card: "#FFFFFF", ink: "#2A1650", soft: "#6B5B8A", accent: "#6D28D9", chip: "#FFFFFF", chip2: "#EAE1F8", g1: "#E2D3FA", g2: "#F7DDEB", tape: "#C9A7F5" },
  { id: "violet", name: "Violet", dark: false, bg: "#F7F2FF", card: "#FFFFFF", ink: "#33195F", soft: "#746590", accent: "#8B5CF6", chip: "#FFFFFF", chip2: "#EEE6FD", g1: "#E9DBFF", g2: "#DCE6FF", tape: "#B79CF7" },
  { id: "gold", name: "Gold", dark: false, bg: "#FBF5E6", card: "#FFFCF3", ink: "#3A2A0C", soft: "#7A6A48", accent: "#94680A", chip: "#FFFFFF", chip2: "#F3EAD2", g1: "#F6E2AC", g2: "#FFF0CC", tape: "#E7C25A" },
  { id: "blue", name: "Blue", dark: false, bg: "#EEF4FC", card: "#FFFFFF", ink: "#12233F", soft: "#56688A", accent: "#2563EB", chip: "#FFFFFF", chip2: "#E1EAF7", g1: "#D3E4FF", g2: "#DFF3FF", tape: "#8DB8F5" },
  { id: "rose", name: "Rose", dark: false, bg: "#FCEFF1", card: "#FFFBFC", ink: "#3D1A22", soft: "#86606A", accent: "#E11D48", chip: "#FFFFFF", chip2: "#F7E1E6", g1: "#FAD3DC", g2: "#FDE7D8", tape: "#F4A3B5" },
  { id: "navy", name: "Navy", dark: true, bg: "#0E1730", card: "#16213F", ink: "#EAF0FF", soft: "#98A6C6", accent: "#F5C26B", chip: "#1D2A4D", chip2: "#1A2546", g1: "#1C2C5C", g2: "#2A2350", tape: "#F5C26B" },
  { id: "midnight", name: "Midnight", dark: true, bg: "#121318", card: "#1C1D24", ink: "#F1EEE8", soft: "#A09A92", accent: "#FF6B6B", chip: "#24252E", chip2: "#20212A", g1: "#2A1E2E", g2: "#1B2433", tape: "#E0B25A" },
];

export const themeOf = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

// The few colours the home-screen widgets need.
export const widgetPalette = (id) => {
  const t = themeOf(id);
  return { id: t.id, paper: t.bg, card: t.card, ink: t.ink, soft: t.soft, accent: t.accent, tape: t.tape, dark: t.dark };
};
