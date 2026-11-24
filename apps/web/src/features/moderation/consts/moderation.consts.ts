export const MODERATION_ROUTES = { queue: '/moderation', signIn: '/sign-in' } as const;
export const QUEUE_PAGE_SIZE = 20;
export type Decision = 'restore' | 'remove';
