// Plain (non-'use client') module so these can be imported by BOTH the client
// form component and the SERVER dedicated-screen route without crossing a client
// boundary (importing a runtime value from a 'use client' module into a Server
// Component turns it into a client reference — see the dedicated-page regression).

/** Customer request kinds that each have a dedicated screen. */
export type RequestFormKind = 'new' | 'update' | 'gps' | 'credit' | 'terms' | 'route' | 'reactivate' | 'close';

export const REQUEST_FORM_KINDS: RequestFormKind[] = ['new', 'update', 'gps', 'credit', 'terms', 'route', 'reactivate', 'close'];
