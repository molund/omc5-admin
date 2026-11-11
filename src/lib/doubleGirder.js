// The spans with two girders, as the site's DOUBLE_GIRDER in src/lib/placeGantry.js (molund/omc5): keep the two the same. Only the
// gantry's arrival is logged on one: no Hung, and no step of the cycle (the card shows one span less until the gantry arrives at
// the next, which the site works out itself).
export const DOUBLE_GIRDER = new Set([31, 43, 44, 45, 46, 47, 52, 53, 54]);

export const isDoubleGirder = (span) => DOUBLE_GIRDER.has(+span);
