'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { ease } from '../MotionKit';
import './admin-motion.css';

/**
 * Motion for the admin panel: a work surface kept open all day, not a landing page. MotionKit's `rise` is a
 * marketing gesture (y:42, rotateX:-16, a heavy spring); everything here moves 6-10px, skips the 3D tilt, and
 * lands in well under 250ms — quick enough to feel like the UI simply finished rendering, not a performance.
 */
export const panelRise: Variants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: .22, ease } } };
export const tileRise: Variants = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: .18, ease } } };
export const rowFade: Variants = { hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { duration: .16, ease } } };
/** For tile grids and nav lists: a handful of items, so a slightly longer stagger still reads instantly. */
export const staggerGroup: Variants = { hidden: {}, show: { transition: { staggerChildren: .045, delayChildren: .02 } } };
/** For table rows: pages can hold dozens, so the per-row delay is a third of `staggerGroup`'s to keep the whole sweep under half a second. */
export const rowGroup: Variants = { hidden: {}, show: { transition: { staggerChildren: .018 } } };

/**
 * Whether motion should stand still, backed by framer's own `useReducedMotion`. That hook resolves via a layout
 * effect, which lands before the browser paints — unlike a plain `useEffect` reading `matchMedia`, which is how
 * AdminCommandPalette reads the preference. The palette can get away with that because its motion only ever
 * mounts once someone opens it (long after hydration settled); the reveals here fire the instant a page mounts,
 * so a passive-effect read would risk one frame of real motion playing before the correction arrived.
 */
export function useAdminStill() {
  return !!useReducedMotion();
}

type RevealTag = 'div' | 'section';
/**
 * Reveals its children once, the moment this instance mounts — never `whileInView`. Admin content sits above the
 * fold and re-renders constantly (a filter change, `useAdminData`'s `pollMs`, a page turn); a scroll trigger would
 * misfire on every one of those. Because `initial`/`animate` below are the constant strings 'hidden'/'show',
 * framer only plays the transition on mount: a later re-render passing the same props does not replay it, so
 * polling and refiltering never make the panel flicker.
 */
export function Reveal({ children, variants = panelRise, as = 'div', className, id, role, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }: {
  children: ReactNode; variants?: Variants; as?: RevealTag; className?: string; id?: string; role?: string;
  'aria-label'?: string; 'aria-labelledby'?: string;
}) {
  const still = useAdminStill();
  const initial = still ? false : 'hidden';
  if (as === 'section') return <motion.section className={className} id={id} role={role} aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} variants={variants} initial={initial} animate="show">{children}</motion.section>;
  return <motion.div className={className} id={id} role={role} aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} variants={variants} initial={initial} animate="show">{children}</motion.div>;
}

/**
 * Reports whether the viewport is at or below the 1000px breakpoint admin-panel.css collapses the sidebar at —
 * `{mobile:false, ready:false}` until the first effect runs, so callers can tell "not yet known" apart from
 * "known and it's desktop" and avoid animating a viewport correction as though it were a user's own toggle.
 */
export function useIsMobileNav() {
  const [state, setState] = useState({ mobile: false, ready: false });
  useEffect(() => {
    const media = matchMedia('(max-width: 1000px)');
    const sync = () => setState({ mobile: media.matches, ready: true });
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return state;
}

/**
 * Keeps a collapsible panel's content mounted for the length of its exit animation before it actually goes away
 * — the same "animate out, then really close" shape AdminCommandPalette's `<dialog>` uses (there via `.close()`
 * on `onExitComplete`; here via whatever attribute or class the caller gates on `visible`). Opening is instant
 * (no lag before content can receive focus); only the closing edge is deferred, and only long enough for the exit
 * transition already running to finish, so `hidden`/collapsed state never gets ahead of what is on screen.
 */
export function useCollapse(open: boolean) {
  const [visible, setVisible] = useState(open);
  if (open && !visible) setVisible(true);
  const onExitComplete = useCallback(() => setVisible(false), []);
  return { visible, onExitComplete };
}
