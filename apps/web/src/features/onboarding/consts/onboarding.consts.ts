/** Guided tour of the demo world: one card per step, text in the `common` catalog (`tour.<id>.title|body`). */
export const TOUR_STEPS = ['play', 'layers', 'notes', 'vr'] as const;
export type TourStepId = (typeof TOUR_STEPS)[number];

/** Versioned so a new tour can be shown again to people who finished the old one. */
export const TOUR_STORAGE_KEY = 'mw.tour.v1';
