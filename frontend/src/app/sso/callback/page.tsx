"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ssoCallback } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { Alert, Button, Spinner } from "@/components/ui";

function SsoCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    let token = searchParams.get("token") || searchParams.get("session");

    if (!token && typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash) {
        const tokenMatch = hash.match(/(?:#|&)(?:token|session)=([^&]+)/);
        if (tokenMatch) {
          token = tokenMatch[1];
        }
      }
    }

    if (!token) {
      setError("No SSO authentication proof found in redirect.");
      setVerifying(false);
      return;
    }

    async function handleSso() {
      try {
        if (typeof window !== "undefined") {
          localStorage.clear();
          sessionStorage.clear();
        }

        const res = await ssoCallback(token!);
        if (res?.user) {
          setUser(res.user);
        }

        router.replace("/received");
      } catch (err) {
        console.error("SSO Callback error:", err);
        if (typeof window !== "undefined") {
          localStorage.clear();
          sessionStorage.clear();
        }
        setError(
          err instanceof Error
            ? err.message
            : "SSO authentication failed. Please try again."
        );
        setVerifying(false);
      }
    }

    void handleSso();
  }, [searchParams, router, setUser]);

  if (verifying) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas">
        <Spinner label="Verifying SSO session…" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[400px] rounded-lg border border-line bg-surface p-6 shadow-card">
        <h1 className="mb-4 text-lg font-semibold text-slate-900">
          SSO Sign-in Failed
        </h1>
        {error && (
          <div className="mb-6">
            <Alert variant="error">{error}</Alert>
          </div>
        )}
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={() => router.push("/login")}
        >
          Back to Sign In
        </Button>
      </div>
    </div>
  );
}

export default function SsoCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center bg-canvas">
          <Spinner label="Verifying SSO session…" />
        </div>
      }
    >
      <SsoCallbackContent />
    </Suspense>
  );
}
