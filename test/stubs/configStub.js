export const BOARD_SIZE = 3;
export const W = BOARD_SIZE;
export const H = BOARD_SIZE;
export const N = W * H;
export const cellStateConstants = {
  NUMBER_MASK: 0x0f,
  REVEALED: 0x10,
  FLAGGED: 0x20,
  MINE: 0x40,
  FINISHED: 0x80,
};
