export default function HomePage() {
  return (
    <div className="max-w-xl mx-auto mt-16 bg-white shadow rounded p-8">
      <h1 className="text-2xl font-semibold mb-4">Welcome to Prixna ERP Pro</h1>
      <p className="text-slate-600 mb-4">
        A powerful ERP and accounting solution built for growth.
      </p>
      <p className="text-slate-700 mb-6">Please login or register to get started.</p>
      <div className="flex gap-4">
        <a
          href="/auth/login"
          className="bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800 transition-colors"
        >
          Login
        </a>
        <a
          href="/auth/register"
          className="border border-slate-300 text-slate-700 px-4 py-2 rounded hover:bg-slate-50 transition-colors"
        >
          Register
        </a>
      </div>
    </div>
  );
}
