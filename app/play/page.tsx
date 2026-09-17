// The Phaser rebuild lives here while the React build stays at `/`. Those components are the
// working reference for behaviour this has to reproduce and are not to be deleted yet — see
// docs/HANDOFF-2026-09-17-phaser.md.
import Stage from '@/components/phaser/Stage';

export const metadata = { title: "Nine O'Clock Hour — canvas" };

export default function Play() {
  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Canvas scaffold</h1>
      <p style={{ margin: 0, maxWidth: '60ch' }}>
        Audio grant first. Tap <strong>Play my hour</strong> once and read the log: it records what the
        browser actually did, including the case where Phaser reports unlocked over a context that never
        started.
      </p>
      <Stage />
    </main>
  );
}
