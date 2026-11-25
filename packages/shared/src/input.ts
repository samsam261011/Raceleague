/** Commandes tout-ou-rien, lues une fois par pas de simulation. */
export const KEY_UP = 1;
export const KEY_DOWN = 2;
export const KEY_LEFT = 4;
export const KEY_RIGHT = 8;

/** Masque de bits des touches enfoncées (combinaison de KEY_*). */
export type Keys = number;
