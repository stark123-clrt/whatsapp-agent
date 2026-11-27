import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="fixed inset-0 z-50 flex items-center justify-center bg-white px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
