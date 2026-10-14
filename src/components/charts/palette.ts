/**
 * Paleta categórica de las gráficas, en orden fijo (nunca cíclico). Validada
 * con el validador de dataviz en modo claro (banda de luminosidad, croma, CVD
 * entre vecinos ≥ 8, contraste ≥ 3:1 sobre blanco). La app no tiene modo oscuro.
 */
export const SERIE = ["#3A4FA8", "#B07A2E", "#1F8FB8", "#C2456E", "#8456C2", "#3E9A55"] as const;

/** Rampa secuencial de un solo tono (azul Impar), de claro a oscuro. */
export const SECUENCIAL = ["#EEF0F8", "#C9CFEA", "#97A2D6", "#5F6FBE", "#3A4FA8", "#1E2A56"] as const;

export const TINTA = {
  primaria: "#1E2A56",
  secundaria: "#2C2C2C",
  muted: "#6E6E6E",
  grid: "#EAEBEE",
};
