import { useEffect, useRef, useState } from "react";

/**
 * Boundary-aware tick hook. Returns a counter that increments each time the
 * wall clock crosses the next boundary at the given granularity. Schedules a
 * single setTimeout to fire at the next boundary — no polling.
 *
 * Usage:
 *   const tick = useNowTick({ granularity: 'minute', tz: 'America/New_York' });
 *   // tick changes when the next minute starts; include it in fetch deps.
 *
 * `granularity` is one of 'second' | 'minute' | 'hour' | 'day', or null to
 * disable. When null the hook is a no-op (counter stays at 0). `tz` only
 * matters for 'day' boundaries (local midnight); for sub-day granularities
 * the wall clock advances uniformly across timezones.
 */
const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const SAFETY_MARGIN_MS = 50; // wake just past the boundary to avoid <-tick races

const nextBoundaryMs = (granularity, tz) => {
    const now = new Date();
    if (granularity === 'second') {
        const ms = now.getMilliseconds();
        return Math.max(0, 1000 - ms) + SAFETY_MARGIN_MS;
    }
    if (granularity === 'minute') {
        const ms = now.getMilliseconds();
        const sec = now.getSeconds();
        return Math.max(0, ONE_MINUTE_MS - sec * 1000 - ms) + SAFETY_MARGIN_MS;
    }
    if (granularity === 'hour') {
        const ms = now.getMilliseconds();
        const sec = now.getSeconds();
        const min = now.getMinutes();
        return Math.max(0, ONE_HOUR_MS - min * ONE_MINUTE_MS - sec * 1000 - ms) + SAFETY_MARGIN_MS;
    }
    if (granularity === 'day') {
        // Compute next local midnight in the requested tz. We do this by
        // formatting `now` in the target tz to get the local components, then
        // the delta to the next 24h boundary in that locale. Since wall-clock
        // duration to local midnight equals UTC duration only when the day
        // doesn't include a DST transition, the safest route is: parse the
        // Intl format back as UTC and add 24h. The result is a UTC instant
        // representing the start of the next local day.
        try {
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: tz || undefined,
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
            }).formatToParts(now);
            const get = (t) => parts.find(p => p.type === t)?.value;
            const y = +get('year'), mo = +get('month'), d = +get('day');
            const h = +get('hour'), mi = +get('minute'), s = +get('second');
            // ms remaining to the END of today (local) + 1ms into tomorrow.
            const msToNextMidnight = ((24 - h) * ONE_HOUR_MS) - (mi * ONE_MINUTE_MS) - (s * 1000) - now.getMilliseconds();
            // Sanity: clamp to at least 1s, at most 25h (covers DST fall-back).
            return Math.min(Math.max(msToNextMidnight, 1000), 25 * ONE_HOUR_MS) + SAFETY_MARGIN_MS;
        } catch {
            // Fallback if Intl can't resolve the tz: 24h from now, minus current
            // UTC time-of-day. Slightly off in non-UTC tz but adequate.
            const utcMidnight = new Date(now);
            utcMidnight.setUTCHours(24, 0, 0, 0);
            return utcMidnight.getTime() - now.getTime() + SAFETY_MARGIN_MS;
        }
    }
    return null;
};

export function useNowTick({ granularity, tz } = {}) {
    const [tick, setTick] = useState(0);
    const timerRef = useRef(null);

    useEffect(() => {
        if (!granularity) {
            // Reset to 0 when disabled so the value is stable across off→on→off
            // transitions on the same dep set.
            setTick(0);
            return;
        }

        let cancelled = false;
        const schedule = () => {
            const ms = nextBoundaryMs(granularity, tz);
            if (ms == null) return;
            timerRef.current = setTimeout(() => {
                if (cancelled) return;
                setTick((t) => t + 1);
                schedule();
            }, ms);
        };

        schedule();

        return () => {
            cancelled = true;
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [granularity, tz]);

    return tick;
}

export default useNowTick;
