import { getDay, getLatestDay } from '@/lib/store';
import { HourBuilder } from '@/components/HourBuilder';

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

  return <HourBuilder day={day} />;
}
