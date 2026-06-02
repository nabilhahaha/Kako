import { create } from 'zustand';

/** Shared open-state for the mobile navigation drawer, so the bottom tab bar's
 *  "More" can open the same drawer the sidebar renders (UX-3). */
export const useMobileNav = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
