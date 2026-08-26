export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      chat_usage: {
        Row: {
          count: number
          day: string
          ip_hash: string
        }
        Insert: {
          count?: number
          day?: string
          ip_hash: string
        }
        Update: {
          count?: number
          day?: string
          ip_hash?: string
        }
        Relationships: []
      }
      citations: {
        Row: {
          edition_id: string | null
          field: string | null
          id: string
          production_id: string | null
          retrieved_on: string
          source_id: string
          team_id: string | null
          viewership_id: string | null
        }
        Insert: {
          edition_id?: string | null
          field?: string | null
          id?: string
          production_id?: string | null
          retrieved_on: string
          source_id: string
          team_id?: string | null
          viewership_id?: string | null
        }
        Update: {
          edition_id?: string | null
          field?: string | null
          id?: string
          production_id?: string | null
          retrieved_on?: string
          source_id?: string
          team_id?: string | null
          viewership_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "citations_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citations_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "production_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citations_viewership_id_fkey"
            columns: ["viewership_id"]
            isOneToOne: false
            referencedRelation: "viewership"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          country: string
          id: string
          lat: number | null
          lng: number | null
          name: string
          slug: string
          state: string | null
          timezone: string | null
        }
        Insert: {
          country?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          slug: string
          state?: string | null
          timezone?: string | null
        }
        Update: {
          country?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          slug?: string
          state?: string | null
          timezone?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          headquarters: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          website: string | null
        }
        Insert: {
          headquarters?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          website?: string | null
        }
        Update: {
          headquarters?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          website?: string | null
        }
        Relationships: []
      }
      editions: {
        Row: {
          city_id: string | null
          confidence: string
          dress_rehearsal: string | null
          end_date: string | null
          id: string
          load_in: string | null
          network_id: string | null
          production_id: string
          show_date: string | null
          start_date: string | null
          status: string
          strike: string | null
          tech_rehearsal: string | null
          venue_id: string | null
          verified_on: string | null
          year: number
        }
        Insert: {
          city_id?: string | null
          confidence?: string
          dress_rehearsal?: string | null
          end_date?: string | null
          id?: string
          load_in?: string | null
          network_id?: string | null
          production_id: string
          show_date?: string | null
          start_date?: string | null
          status?: string
          strike?: string | null
          tech_rehearsal?: string | null
          venue_id?: string | null
          verified_on?: string | null
          year: number
        }
        Update: {
          city_id?: string | null
          confidence?: string
          dress_rehearsal?: string | null
          end_date?: string | null
          id?: string
          load_in?: string | null
          network_id?: string | null
          production_id?: string
          show_date?: string | null
          start_date?: string | null
          status?: string
          strike?: string | null
          tech_rehearsal?: string | null
          venue_id?: string | null
          verified_on?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "editions_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editions_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editions_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      external_ids: {
        Row: {
          city_id: string | null
          company_id: string | null
          created_at: string
          external_id: string
          id: string
          network_id: string | null
          production_id: string | null
          retrieved_on: string
          source: string
          venue_id: string | null
        }
        Insert: {
          city_id?: string | null
          company_id?: string | null
          created_at?: string
          external_id: string
          id?: string
          network_id?: string | null
          production_id?: string | null
          retrieved_on: string
          source: string
          venue_id?: string | null
        }
        Update: {
          city_id?: string | null
          company_id?: string | null
          created_at?: string
          external_id?: string
          id?: string
          network_id?: string | null
          production_id?: string | null
          retrieved_on?: string
          source?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_ids_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_ids_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_ids_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_ids_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_ids_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          production_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          production_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          production_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      networks: {
        Row: {
          id: string
          is_streaming: boolean
          logo_url: string | null
          name: string
          slug: string
          website: string | null
        }
        Insert: {
          id?: string
          is_streaming?: boolean
          logo_url?: string | null
          name: string
          slug: string
          website?: string | null
        }
        Update: {
          id?: string
          is_streaming?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          website?: string | null
        }
        Relationships: []
      }
      production_team: {
        Row: {
          company_id: string | null
          edition_id: string | null
          id: string
          note: string | null
          person_name: string | null
          production_id: string
          role: string
          sort_order: number
        }
        Insert: {
          company_id?: string | null
          edition_id?: string | null
          id?: string
          note?: string | null
          person_name?: string | null
          production_id: string
          role: string
          sort_order?: number
        }
        Update: {
          company_id?: string | null
          edition_id?: string | null
          id?: string
          note?: string | null
          person_name?: string | null
          production_id?: string
          role?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_team_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_team_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_team_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      productions: {
        Row: {
          category: string
          confidence: string
          created_at: string
          description: string | null
          hero_image_url: string | null
          id: string
          logo_url: string | null
          name: string
          network_id: string | null
          production_company_id: string | null
          production_scale: number | null
          recurring: boolean
          slug: string
          subcategory: string | null
          typical_month: number | null
          updated_at: string
          verified_on: string | null
        }
        Insert: {
          category: string
          confidence?: string
          created_at?: string
          description?: string | null
          hero_image_url?: string | null
          id?: string
          logo_url?: string | null
          name: string
          network_id?: string | null
          production_company_id?: string | null
          production_scale?: number | null
          recurring?: boolean
          slug: string
          subcategory?: string | null
          typical_month?: number | null
          updated_at?: string
          verified_on?: string | null
        }
        Update: {
          category?: string
          confidence?: string
          created_at?: string
          description?: string | null
          hero_image_url?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          network_id?: string | null
          production_company_id?: string | null
          production_scale?: number | null
          recurring?: boolean
          slug?: string
          subcategory?: string | null
          typical_month?: number | null
          updated_at?: string
          verified_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "productions_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_production_company_id_fkey"
            columns: ["production_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          role?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          created_at: string
          id: string
          published_on: string | null
          publisher: string
          tier: string
          title: string | null
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          published_on?: string | null
          publisher: string
          tier: string
          title?: string | null
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          published_on?: string | null
          publisher?: string
          tier?: string
          title?: string | null
          url?: string
        }
        Relationships: []
      }
      venues: {
        Row: {
          address: string | null
          capacity: number | null
          city_id: string | null
          id: string
          name: string
          slug: string
          website: string | null
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          city_id?: string | null
          id?: string
          name: string
          slug: string
          website?: string | null
        }
        Update: {
          address?: string | null
          capacity?: number | null
          city_id?: string | null
          id?: string
          name?: string
          slug?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venues_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      viewership: {
        Row: {
          average_viewers: number | null
          id: string
          peak_viewers: number | null
          production_id: string
          year: number
        }
        Insert: {
          average_viewers?: number | null
          id?: string
          peak_viewers?: number | null
          production_id: string
          year: number
        }
        Update: {
          average_viewers?: number | null
          id?: string
          peak_viewers?: number | null
          production_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "viewership_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_chat_usage: { Args: { p_ip_hash: string }; Returns: number }
      is_editor: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
