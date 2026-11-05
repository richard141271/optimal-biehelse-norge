"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type Lager = {
  id: string;
  name?: string | null;
  address?: string | null;
  location_type?: string | null;
  responsible_lager_id?: string | null;
  updated_at?: string | null;
  active?: boolean | null;
  balances?: Record<string, number> | null;
  last_comment?: string | null;
};

type MemberWarehouse = {
  epost?: string | null;
  navn?: string | null;
  lagerId: string;
};

type ApiState =
  | { type: "loading" }
  | { type: "error"; message: string }
  | {
      type: "ready";
      lagre: Lager[];
      locations: Lager[];
      members: MemberWarehouse[];
    };

function formatWhen(iso?: string | null) {
  const s = String(iso ?? "").trim();
  if (!s) return "Ukjent";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "Ukjent";
  return d.toLocaleString("nb-NO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(d: Date) {
  return d.toLocaleDateString("nb-NO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getStatus(glasses: number, active: boolean) {
  if (!active) return "Inaktiv";
  if (glasses <= 0) return "Tom";
  if (glasses <= 5) return "Lav";
  if (glasses <= 14) return "OK";
  return "Full";
}

function getStatusClass(status: string) {
  if (status === "Tom") return "border-red-200 bg-red-50 text-red-700";
  if (status === "Lav") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "Full") return "border-green-200 bg-green-50 text-green-700";
  if (status === "Inaktiv") return "border-zinc-200 bg-zinc-50 text-zinc-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

export default function BieEskePdfLokasjonerPage() {
  const [api, setApi] = useState<ApiState>({ type: "loading" });
  const [createdAt] = useState(() => new Date());

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        const res = await fetch(`/api/admin/bie-eske-system?ts=${Date.now()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          feil?: string;
          lagre?: Lager[];
          locations?: Lager[];
          members?: MemberWarehouse[];
        };
        if (!active) return;
        if (!res.ok || !json.ok) {
          setApi({
            type: "error",
            message: String(json.feil ?? "Kunne ikke hente lokasjoner."),
          });
          return;
        }
        setApi({
          type: "ready",
          lagre: Array.isArray(json.lagre) ? json.lagre : [],
          locations: Array.isArray(json.locations) ? json.locations : [],
          members: Array.isArray(json.members) ? json.members : [],
        });
      } catch {
        if (!active) return;
        setApi({ type: "error", message: "Kunne ikke hente lokasjoner." });
      }
    }

    void run();
    return () => {
      active = false;
    };
  }, []);

  const locations = useMemo(() => {
    if (api.type !== "ready") return [];

    const lagerNameById = new Map<string, string>();
    for (const lager of api.lagre) {
      const id = String(lager.id ?? "").trim();
      const name = String(lager.name ?? "").trim();
      if (id && name) lagerNameById.set(id, name);
    }

    const memberNameByLagerId = new Map<string, string>();
    for (const member of api.members) {
      const lagerId = String(member.lagerId ?? "").trim();
      const name = String(member.navn ?? member.epost ?? "").trim();
      if (lagerId && name && !memberNameByLagerId.has(lagerId)) {
        memberNameByLagerId.set(lagerId, name);
      }
    }

    return [...api.locations]
      .filter((location) => String(location.id ?? "").trim())
      .sort((a, b) =>
        String(a.name ?? "").localeCompare(String(b.name ?? ""), "nb-NO"),
      )
      .map((location) => {
        const balances = location.balances ?? {};
        const boxes = Math.max(
          0,
          Math.trunc(Number(balances["bie_eske"] ?? 0)),
        );
        const glasses = Math.max(0, Math.trunc(Number(balances["glass"] ?? 0)));
        const responsibleId = String(
          location.responsible_lager_id ?? "",
        ).trim();
        const responsible =
          (responsibleId
            ? (memberNameByLagerId.get(responsibleId) ??
              lagerNameById.get(responsibleId))
            : "") || "Ikke satt";
        const active = location.active !== false;
        const status = getStatus(glasses, active);

        return {
          id: location.id,
          name: String(location.name ?? "").trim() || "Ukjent lokasjon",
          type: String(location.location_type ?? "").trim() || "Ukjent type",
          address: String(location.address ?? "").trim() || "Ukjent adresse",
          updatedAt: formatWhen(location.updated_at),
          comment: String(location.last_comment ?? "").trim(),
          responsible,
          boxes,
          glasses,
          status,
          active,
        };
      });
  }, [api]);

  const summary = useMemo(() => {
    const total = locations.length;
    const active = locations.filter((location) => location.active).length;
    const boxes = locations.reduce((sum, location) => sum + location.boxes, 0);
    const glasses = locations.reduce(
      (sum, location) => sum + location.glasses,
      0,
    );
    return { total, active, boxes, glasses };
  }, [locations]);

  return (
    <div className="pdf-print-page mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }

          html,
          body {
            background: white !important;
          }

          .print-hidden {
            display: none !important;
          }

          .print-break-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .print-grid {
            grid-template-columns: 1fr !important;
          }

          .pdf-print-page {
            max-width: none !important;
            padding: 0 !important;
          }

          .pdf-print-border {
            border-color: rgb(212 212 216) !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="print-hidden flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/admin/bie-eske-system"
            className="text-sm font-medium underline underline-offset-4"
          >
            Tilbake til Bie-Eske System
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            PDF av lokasjoner
          </h1>
          <p className="text-sm text-muted-foreground">
            Åpne utskriftsdialogen og velg «Lagre som PDF» eller skriv ut
            direkte.
          </p>
        </div>
        <Button onClick={() => window.print()}>Skriv ut / lagre PDF</Button>
      </div>

      <header className="pdf-print-border rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Bie-Eske System
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Lokasjonsoversikt for feltarbeid
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Utskriftsvennlig oversikt over lokasjoner, beholdning og plass til
              manuelle kontroller ute i felt.
            </p>
          </div>
          <div className="rounded-xl border bg-background px-4 py-3 text-sm">
            <div>
              <span className="font-medium">Dato:</span>{" "}
              {formatDateOnly(createdAt)}
            </div>
            <div>
              <span className="font-medium">Generert:</span>{" "}
              {formatWhen(createdAt.toISOString())}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border bg-background p-3">
            <div className="text-xs text-muted-foreground">Lokasjoner</div>
            <div className="mt-1 text-2xl font-semibold">{summary.total}</div>
          </div>
          <div className="rounded-xl border bg-background p-3">
            <div className="text-xs text-muted-foreground">Aktive</div>
            <div className="mt-1 text-2xl font-semibold">{summary.active}</div>
          </div>
          <div className="rounded-xl border bg-background p-3">
            <div className="text-xs text-muted-foreground">Esker ute</div>
            <div className="mt-1 text-2xl font-semibold">{summary.boxes}</div>
          </div>
          <div className="rounded-xl border bg-background p-3">
            <div className="text-xs text-muted-foreground">Glass ute</div>
            <div className="mt-1 text-2xl font-semibold">{summary.glasses}</div>
          </div>
        </div>
      </header>

      {api.type === "loading" ? (
        <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          Henter lokasjoner…
        </div>
      ) : null}

      {api.type === "error" ? (
        <div className="rounded-2xl border bg-card p-6 text-sm">
          {api.message}
        </div>
      ) : null}

      {api.type === "ready" && !locations.length ? (
        <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          Ingen lokasjoner å skrive ut.
        </div>
      ) : null}

      {api.type === "ready" && locations.length ? (
        <section className="grid print-grid gap-4">
          {locations.map((location, index) => (
            <article
              key={location.id}
              className="pdf-print-border print-break-avoid rounded-2xl border bg-card p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      #{index + 1}
                    </span>
                    <h2 className="text-xl font-semibold tracking-tight">
                      {location.name}
                    </h2>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClass(location.status)}`}
                    >
                      {location.status}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {location.type} · {location.address}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Oppdatert {location.updatedAt}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl border bg-background p-3">
                  <div className="text-xs text-muted-foreground">Ansvarlig</div>
                  <div className="mt-1 font-medium">{location.responsible}</div>
                </div>
                <div className="rounded-xl border bg-background p-3">
                  <div className="text-xs text-muted-foreground">Esker</div>
                  <div className="mt-1 text-xl font-semibold">
                    {location.boxes}
                  </div>
                </div>
                <div className="rounded-xl border bg-background p-3">
                  <div className="text-xs text-muted-foreground">Glass</div>
                  <div className="mt-1 text-xl font-semibold">
                    {location.glasses}
                  </div>
                </div>
                <div className="rounded-xl border bg-background p-3">
                  <div className="text-xs text-muted-foreground">
                    Sist kommentar
                  </div>
                  <div className="mt-1 text-sm">{location.comment || "—"}</div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-5">
                {[
                  "Besøkt",
                  "Telt opp",
                  "Påfylt",
                  "Hentet inn",
                  "Oppfølging",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-lg border bg-background px-3 py-2 text-sm"
                  >
                    <span className="mr-2 inline-block h-4 w-4 rounded-sm border border-foreground align-[-2px]" />
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <div className="text-sm font-medium">Feltnotater</div>
                <div className="mt-2 rounded-xl border bg-background p-3">
                  <div className="h-5 border-b border-dashed border-zinc-300" />
                  <div className="mt-3 h-5 border-b border-dashed border-zinc-300" />
                  <div className="mt-3 h-5 border-b border-dashed border-zinc-300" />
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
