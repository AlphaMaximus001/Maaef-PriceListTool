import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-maaef-purple p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-maaef-red text-lg font-bold tracking-tight text-white">
            M
          </div>
          <h1 className="text-xl font-semibold text-white">Maaef Pricing</h1>
          <p className="mt-1 text-sm text-maaef-blush/80">
            Know where you overlap. Know where you&apos;re unique.
          </p>
        </div>
        <LoginForm next={next ?? "/dashboard"} />
      </div>
    </main>
  );
}
