/**
 * PLACEHOLDER — hand-authored to mirror supabase/migrations/20260806000000_init.sql.
 *
 * This file is REGENERATED from the live database, never hand-edited long-term:
 *   npm run db:types
 * It exists in hand-written form only so the app typechecks before the Supabase
 * project is linked. Once `npm run db:types` runs, this content is overwritten.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      cities: {
        Row: {
          id: string;
          name: string;
          slug: string;
          state: string | null;
          country: string;
          timezone: string | null;
          lat: number | null;
          lng: number | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          state?: string | null;
          country?: string;
          timezone?: string | null;
          lat?: number | null;
          lng?: number | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          state?: string | null;
          country?: string;
          timezone?: string | null;
          lat?: number | null;
          lng?: number | null;
        };
        Relationships: [];
      };
      networks: {
        Row: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          is_streaming: boolean;
          website: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          logo_url?: string | null;
          is_streaming?: boolean;
          website?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          logo_url?: string | null;
          is_streaming?: boolean;
          website?: string | null;
        };
        Relationships: [];
      };
      companies: {
        Row: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          headquarters: string | null;
          website: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          logo_url?: string | null;
          headquarters?: string | null;
          website?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          logo_url?: string | null;
          headquarters?: string | null;
          website?: string | null;
        };
        Relationships: [];
      };
      venues: {
        Row: {
          id: string;
          name: string;
          slug: string;
          address: string | null;
          city_id: string | null;
          capacity: number | null;
          website: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          address?: string | null;
          city_id?: string | null;
          capacity?: number | null;
          website?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          address?: string | null;
          city_id?: string | null;
          capacity?: number | null;
          website?: string | null;
        };
        Relationships: [];
      };
      productions: {
        Row: {
          id: string;
          name: string;
          slug: string;
          category: string;
          subcategory: string | null;
          network_id: string | null;
          production_company_id: string | null;
          typical_month: number | null;
          recurring: boolean;
          production_scale: number | null;
          description: string | null;
          logo_url: string | null;
          hero_image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          category: string;
          subcategory?: string | null;
          network_id?: string | null;
          production_company_id?: string | null;
          typical_month?: number | null;
          recurring?: boolean;
          production_scale?: number | null;
          description?: string | null;
          logo_url?: string | null;
          hero_image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          category?: string;
          subcategory?: string | null;
          network_id?: string | null;
          production_company_id?: string | null;
          typical_month?: number | null;
          recurring?: boolean;
          production_scale?: number | null;
          description?: string | null;
          logo_url?: string | null;
          hero_image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      editions: {
        Row: {
          id: string;
          production_id: string;
          year: number;
          start_date: string | null;
          end_date: string | null;
          venue_id: string | null;
          city_id: string | null;
          status: string;
          load_in: string | null;
          tech_rehearsal: string | null;
          dress_rehearsal: string | null;
          show_date: string | null;
          strike: string | null;
        };
        Insert: {
          id?: string;
          production_id: string;
          year: number;
          start_date?: string | null;
          end_date?: string | null;
          venue_id?: string | null;
          city_id?: string | null;
          status?: string;
          load_in?: string | null;
          tech_rehearsal?: string | null;
          dress_rehearsal?: string | null;
          show_date?: string | null;
          strike?: string | null;
        };
        Update: {
          id?: string;
          production_id?: string;
          year?: number;
          start_date?: string | null;
          end_date?: string | null;
          venue_id?: string | null;
          city_id?: string | null;
          status?: string;
          load_in?: string | null;
          tech_rehearsal?: string | null;
          dress_rehearsal?: string | null;
          show_date?: string | null;
          strike?: string | null;
        };
        Relationships: [];
      };
      viewership: {
        Row: {
          id: string;
          production_id: string;
          year: number;
          average_viewers: number | null;
          peak_viewers: number | null;
        };
        Insert: {
          id?: string;
          production_id: string;
          year: number;
          average_viewers?: number | null;
          peak_viewers?: number | null;
        };
        Update: {
          id?: string;
          production_id?: string;
          year?: number;
          average_viewers?: number | null;
          peak_viewers?: number | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: { id: string; display_name: string | null; role: string; created_at: string };
        Insert: { id: string; display_name?: string | null; role?: string; created_at?: string };
        Update: { id?: string; display_name?: string | null; role?: string; created_at?: string };
        Relationships: [];
      };
      favorites: {
        Row: { user_id: string; production_id: string; created_at: string };
        Insert: { user_id: string; production_id: string; created_at?: string };
        Update: { user_id?: string; production_id?: string; created_at?: string };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_editor: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

/** Convenience row aliases used across the app. */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
