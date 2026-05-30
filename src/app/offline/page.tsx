/**
 * Offline fallback page — served by the service worker when the user is offline.
 *
 * Self-contained on purpose: inline styles only, no i18n provider / cookies /
 * dynamic data, since the SW serves it from cache with no network. It renders
 * inside the root layout (a page can't replace it), so it stays a plain element.
 */

export const metadata = {
  title: 'غير متصل | VANTORA',
};

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: '#f8fafc',
        color: '#1e293b',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '1rem',
          padding: '2.5rem 2rem',
          maxWidth: '26rem',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 4px 24px 0 rgba(0,0,0,0.06)',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 64,
            height: 64,
            borderRadius: 16,
            background: '#6366f1',
            color: '#ffffff',
            fontSize: '1.375rem',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            marginBottom: '1.5rem',
          }}
        >
          V
        </div>

        <div style={{ fontSize: '2.25rem', marginBottom: '0.75rem', lineHeight: 1 }}>📶</div>

        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', direction: 'rtl' }}>
          أنت غير متصل بالإنترنت
        </h1>

        <div style={{ width: '2rem', height: 2, background: '#e2e8f0', borderRadius: 1, margin: '1rem auto' }} />

        <p style={{ fontSize: '0.9375rem', color: '#64748b', direction: 'ltr' }}>
          You&rsquo;re offline — check your connection.
        </p>
        <p style={{ fontSize: '0.875rem', color: '#94a3b8', direction: 'ltr', marginTop: '0.25rem' }}>
          The app will reconnect automatically.
        </p>
      </div>
    </div>
  );
}
