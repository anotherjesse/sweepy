export const BOARD_SIZE = 1000;
export const W = BOARD_SIZE, H = BOARD_SIZE, N = W * H;


export type CellStateConstants = {
    NUMBER_MASK: number;
    REVEALED: number;
    FLAGGED: number;
    MINE: number;
    FINISHED: number;
};

export const cellStateConstants: CellStateConstants = {
    NUMBER_MASK: 0x0f, // 00001111 (4 bits for adjacent mines, bits 0-3)
    REVEALED: 0x10, // 00010000
    FLAGGED: 0x20, // 00100000
    MINE: 0x40, // 01000000
    FINISHED: 0x80, // 10000000 (for completely boxed-in mines)
};
