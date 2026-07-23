"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RouteRecalculateButton({ routeId }: { routeId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch(`/api/routes/${routeId}/recalculate`, { method: "POST" });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={run}
      disabled={loading}
      className="text-xs underline disabled:opacity-60"
      style={{ color: "var(--brand)" }}
    >
      {loading ? "Recalculando..." : "Recalcular"}
    </button>
  );
}
