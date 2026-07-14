"use client";

import * as React from "react";
import Link from "next/link";
import { Search, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/utils";

export type ConfigProduct = {
  id: string;
  sku: string;
  product_name: string;
  category: string | null;
  price: number;
  currency: string;
};

export function ConfiguratorList({ products }: { products: ConfigProduct[] }) {
  const [query, setQuery] = React.useState("");

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.product_name.toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q),
    );
  }, [query, products]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search a SKU, product, or category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        {shown.map((p) => (
          <Link
            key={p.id}
            href={`/configurator/${p.id}`}
            className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted"
          >
            <div>
              <div className="font-medium">{p.product_name}</div>
              <div className="text-xs text-muted-foreground">
                {p.sku} · {p.category ?? "—"}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-medium">{formatPrice(p.price, p.currency)}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
        ))}
        {shown.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {products.length === 0 ? "No products yet — import your list first." : "No products match your search."}
          </p>
        )}
      </div>
    </div>
  );
}
