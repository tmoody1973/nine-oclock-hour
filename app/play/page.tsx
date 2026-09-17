// The Phaser rebuild lives here while the React build stays at `/`. Those components are the
// working reference for behaviour this has to reproduce and are not to be deleted yet — see
// docs/HANDOFF-2026-09-17-phaser.md.
import { getDay, getLatestDay } from '@/lib/store';
import { buildWire } from '@/lib/wire';
import Stage from '@/components/phaser/Stage';

export const metadata = { title: "Nine O'Clock Hour — canvas" };

// Never frozen at build time, for the same reason `/` is not: this awaits the day file, and a
// static prerender would serve the build's snapshot of the wire forever. See app/page.tsx.
export const dynamic = 'force-dynamic';

// The home station, matching the React build's default. A station picker belongs here
// eventually; it is not what this scaffold is proving.
const HOME = 's921';

export default async function Play() {
  // ONE clock reading per request, taken here and passed down. This page is force-dynamic, so
  // it renders once per request and never re-renders — but Card would re-render, and reading
  // the clock there would be both impure and a hydration mismatch (server and client would
  // disagree about what has expired). Same seam as block() in lib/wire.ts, which takes `now`.
  const at = new Date();
  const today = at.toISOString().slice(0, 10);
  const day = (await getDay(today)) ?? (await getLatestDay());

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Canvas scaffold</h1>
      {day ? (
        <Stage items={buildWire(day, HOME)} now={at.getTime()} />
      ) : (
        <p style={{ margin: 0 }}>
          No day file yet — the 5 a.m. build hasn&rsquo;t run. Trigger <code>/api/cron/build-day</code> by hand.
        </p>
      )}
    </main>
  );
}
