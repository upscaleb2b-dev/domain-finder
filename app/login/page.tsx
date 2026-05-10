export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const error = searchParams?.error;
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 w-80">
        <h1 className="text-xl font-bold mb-1 text-white">Legacy Google Finder</h1>
        <p className="text-gray-500 text-sm mb-6">Private dashboard</p>
        <form method="POST" action="/api/auth">
          <input
            type="password"
            name="password"
            autoFocus
            autoComplete="current-password"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            placeholder="Password"
          />
          {error && (
            <p className="text-red-400 text-xs mb-3">Wrong password, try again.</p>
          )}
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 rounded-lg py-2 text-sm font-semibold text-white transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
