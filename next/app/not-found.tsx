export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <p className="text-muted-foreground mb-6">Page not found</p>
      <a href="/chat" className="px-4 py-2 bg-primary text-primary-foreground rounded-md">
        Go Home
      </a>
    </div>
  );
}
