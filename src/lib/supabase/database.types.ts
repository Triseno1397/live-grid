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
        Relationships: [
          {
            foreignKeyName: "venues_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "productions_network_id_fkey";
            columns: ["network_id"];
            isOneToOne: false;
            referencedRelation: "networks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "productions_production_company_id_fkey";
            columns: ["production_company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
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
          network_id: string | null;
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
          network_id?: string | null;
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
          network_id?: string | null;
          status?: string;
          load_in?: string | null;
          tech_rehearsal?: string | null;
          dress_rehearsal?: string | null;
          show_date?: string | null;
          strike?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "editions_production_id_fkey";
            columns: ["production_id"];
            isOneToOne: false;
            referencedRelation: "productions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "editions_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "editions_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "editions_network_id_fkey";
            columns: ["network_id"];
            isOneToOne: false;
            referencedRelation: "networks";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "viewership_production_id_fkey";
            columns: ["production_id"];
            isOneToOne: false;
            referencedRelation: "productions";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "favorites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "favorites_production_id_fkey";
            columns: ["production_id"];
            isOneToOne: false;
            referencedRelation: "productions";
            referencedColumns: ["id"];
          },
        ];
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
