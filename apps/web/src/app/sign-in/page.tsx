import { SignInForm } from '@/features/auth';

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center p-4 sm:p-6">
      <SignInForm />
    </main>
  );
}
