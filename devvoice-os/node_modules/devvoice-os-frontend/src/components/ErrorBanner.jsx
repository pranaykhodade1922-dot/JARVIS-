export default function ErrorBanner({ message }) {
  if (!message) {
    return null;
  }

  return (
    <section className="error-banner" role="alert" aria-live="polite">
      <span className="error-banner-mark" />
      <p>{message}</p>
    </section>
  );
}
