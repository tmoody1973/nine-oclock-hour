import { getDay, getLatestDay } from '@/lib/store';
import { HourBuilder } from '@/components/HourBuilder';

// This page must never be frozen at build time. It awaits getDay()/getLatestDay(), so
// without this Next prerenders it as static: the build's snapshot of the wire becomes the
// page every listener sees, for the life of that deployment. In CI, with no credentials,
// that snapshot is the "no day file yet" fallback. On Vercel it would be whichever day
// happened to exist when the build ran, and it would never update again -- a news product
// showing one frozen morning forever. Proven by the route table: `○ /` before, `ƒ /` after.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const today = new Date().toISOString().slice(0, 10);
  const day = (await getDay(today)) ?? (await getLatestDay());

  if (!day) {
    return (
      <main style={{ padding: 40, fontFamily: 'system-ui, sans-serif' }}>
        <h1>{"Nine O'Clock Hour"}</h1>
        <p>No day file yet — the 5 a.m. build hasn&rsquo;t run. Check back after it does, or trigger <code>/api/cron/build-day</code> by hand.</p>
      </main>
    );
  }

  return (
    <>
      {/* The Phaser rebuild lives at /play and nothing pointed at it, so the only way to find
          it was to know the URL. That is how the per-story preview player — the whole reason
          the rebuild started — went unseen: it exists there and has never existed here. */}
      <p style={{ margin: 0, padding: '10px 16px', background: '#101010', color: '#f4f4f4', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
        This is the original build.{' '}
        <a href="/play" style={{ color: '#7fb2ff' }}>Open the canvas version at /play</a>{' '}
        — the one with the wire strip, the cards and the built-in preview player.
      </p>
      <HourBuilder day={day} />
    </>
  );
}
