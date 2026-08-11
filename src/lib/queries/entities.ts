import { cache } from "react";

import { createPublicClient } from "@/lib/supabase/public";

import { getProductions } from "./productions";
import type { Production } from "./types";

export type CityRecord = {
  name: string;
  slug: string;
  state: string | null;
  country: string;
  timezone: string | null;
};

export type NetworkRecord = {
  name: string;
  slug: string;
  logoUrl: string | null;
  isStreaming: boolean;
  website: string | null;
};

export type CompanyRecord = {
  name: string;
  slug: string;
  logoUrl: string | null;
  headquarters: string | null;
  website: string | null;
};

export type VenueRecord = {
  name: string;
  slug: string;
  address: string | null;
  capacity: number | null;
  website: string | null;
  city: { name: string; slug: string; state: string | null } | null;
};

export const getCity = cache(async (slug: string): Promise<CityRecord | null> => {
  const db = createPublicClient();
  const { data, error } = await db
    .from("cities")
    .select("name, slug, state, country, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`city "${slug}" query failed: ${error.message}`);
  return data;
});

export const getNetwork = cache(async (slug: string): Promise<NetworkRecord | null> => {
  const db = createPublicClient();
  const { data, error } = await db
    .from("networks")
    .select("name, slug, logo_url, is_streaming, website")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`network "${slug}" query failed: ${error.message}`);
  return data
    ? {
        name: data.name,
        slug: data.slug,
        logoUrl: data.logo_url,
        isStreaming: data.is_streaming,
        website: data.website,
      }
    : null;
});

export const getCompany = cache(async (slug: string): Promise<CompanyRecord | null> => {
  const db = createPublicClient();
  const { data, error } = await db
    .from("companies")
    .select("name, slug, logo_url, headquarters, website")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`company "${slug}" query failed: ${error.message}`);
  return data
    ? {
        name: data.name,
        slug: data.slug,
        logoUrl: data.logo_url,
        headquarters: data.headquarters,
        website: data.website,
      }
    : null;
});

/** Venues in a city, with the editions that use them counted by the caller. */
export const getVenuesInCity = cache(async (citySlug: string): Promise<VenueRecord[]> => {
  const db = createPublicClient();
  const { data, error } = await db
    .from("venues")
    .select("name, slug, address, capacity, website, cities!inner(name, slug, state)")
    .eq("cities.slug", citySlug)
    .order("name");
  if (error) throw new Error(`venues in "${citySlug}" query failed: ${error.message}`);
  return (data ?? []).map((v) => ({
    name: v.name,
    slug: v.slug,
    address: v.address,
    capacity: v.capacity,
    website: v.website,
    city: v.cities ? { name: v.cities.name, slug: v.cities.slug, state: v.cities.state } : null,
  }));
});

/**
 * Productions with at least one edition in this city.
 *
 * City lives on the edition, not the production — a show that moves (Grammys LA to
 * Vegas, or a series relocating to Georgia) belongs to both cities' pages, in the year it
 * was in each. The returned productions keep only their editions in that city, so the
 * page's dates and countdowns describe this city rather than the show's global schedule.
 */
export async function productionsInCity(citySlug: string): Promise<Production[]> {
  const productions = await getProductions();
  return productions
    .map((p) => ({ ...p, editions: p.editions.filter((e) => e.city?.slug === citySlug) }))
    .filter((p) => p.editions.length > 0);
}

/**
 * Productions on a network, by the production default or by any edition override.
 *
 * Editions are narrowed the same way where an override exists: the Grammys' ABC page
 * should show 2027, not the CBS years.
 */
export async function productionsOnNetwork(networkSlug: string): Promise<Production[]> {
  const productions = await getProductions();
  return productions
    .map((p) => {
      const overridden = p.editions.filter((e) => e.network?.slug === networkSlug);
      if (overridden.length > 0) return { ...p, editions: overridden };
      if (p.network?.slug !== networkSlug) return null;
      // Production default applies to every edition that does not override it.
      return { ...p, editions: p.editions.filter((e) => e.network === null) };
    })
    .filter((p): p is Production => p !== null && p.editions.length > 0);
}

export async function productionsByCompany(companySlug: string): Promise<Production[]> {
  const productions = await getProductions();
  return productions.filter((p) => p.company?.slug === companySlug);
}

/** Slugs for generateStaticParams — cheap, and keeps entity pages prerenderable. */
export const getEntitySlugs = cache(
  async (table: "cities" | "networks" | "companies" | "productions"): Promise<string[]> => {
    const db = createPublicClient();
    const { data, error } = await db.from(table).select("slug");
    if (error) throw new Error(`${table} slug query failed: ${error.message}`);
    return (data ?? []).map((r) => r.slug);
  },
);
