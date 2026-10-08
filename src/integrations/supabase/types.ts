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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      businesses: {
        Row: {
          address: string | null
          business_status: string | null
          category: string | null
          created_at: string
          discovery_run_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          maps_url: string | null
          name: string
          owner_id: string
          phone: string | null
          place_id: string
          rating: number | null
          review_count: number | null
          score: number | null
          source: string
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          business_status?: string | null
          category?: string | null
          created_at?: string
          discovery_run_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          maps_url?: string | null
          name: string
          owner_id?: string
          phone?: string | null
          place_id: string
          rating?: number | null
          review_count?: number | null
          score?: number | null
          source?: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          business_status?: string | null
          category?: string | null
          created_at?: string
          discovery_run_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          maps_url?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          place_id?: string
          rating?: number | null
          review_count?: number | null
          score?: number | null
          source?: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      discovery_runs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          location: string | null
          new_count: number
          owner_id: string
          query: string
          results_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          location?: string | null
          new_count?: number
          owner_id?: string
          query: string
          results_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          location?: string | null
          new_count?: number
          owner_id?: string
          query?: string
          results_count?: number
          status?: string
        }
        Relationships: []
      }
      investigations: {
        Row: {
          business_id: string
          created_at: string
          findings: Json
          id: string
          owner_id: string
          recommended_offer: string | null
          report: Json | null
          score: number | null
          website_https: boolean | null
          website_load_ms: number | null
          website_reachable: boolean | null
          website_status: number | null
          website_title: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          findings?: Json
          id?: string
          owner_id?: string
          recommended_offer?: string | null
          report?: Json | null
          score?: number | null
          website_https?: boolean | null
          website_load_ms?: number | null
          website_reachable?: boolean | null
          website_status?: number | null
          website_title?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          findings?: Json
          id?: string
          owner_id?: string
          recommended_offer?: string | null
          report?: Json | null
          score?: number | null
          website_https?: boolean | null
          website_load_ms?: number | null
          website_reachable?: boolean | null
          website_status?: number | null
          website_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investigations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
