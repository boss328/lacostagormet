'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="wrap home-section">
      <div className="empty-state" role="alert">
        <h1 className="type-display-2">We couldn’t load this page.</h1>
        <p>Please try again. If you still need help, call (858) 354-1120.</p>
        <button className="btn btn-solid" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
