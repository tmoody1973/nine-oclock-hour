import { buildDay } from '@/lib/day';
import { putDay } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = req.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) return new Response('no', { status: 401 });
  const day = await buildDay();
  const url = await putDay(day);
  // `degraded` names any feed that failed this morning. It is the only machine-readable
  // signal that the wire is thin because something broke rather than because nobody filed,
  // so it belongs in the response a human or a monitor actually looks at. Absent on a
  // healthy day — see lib/types.ts.
  return Response.json({
    date: day.date,
    network: day.network.length,
    stations: Object.fromEntries(Object.entries(day.stations).map(([id, st]) => [id, st.local.length])),
    degraded: day.degraded ?? [],
    url,
  });
}
