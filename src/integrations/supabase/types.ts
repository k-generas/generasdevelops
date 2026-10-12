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
      business_activity_events: {
        Row: {
          business_id: string | null
          created_at: string
          details: Json
          event_type: string
          id: string
          owner_id: string
          ref_id: string | null
          ref_table: string | null
          summary: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          owner_id?: string
          ref_id?: string | null
          ref_table?: string | null
          summary: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          owner_id?: string
          ref_id?: string | null
          ref_table?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_activity_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_notes: {
        Row: {
          body: string
          business_id: string
          created_at: string
          id: string
          owner_id: string
        }
        Insert: {
          body: string
          business_id: string
          created_at?: string
          id?: string
          owner_id?: string
        }
        Update: {
          body?: string
          business_id?: string
          created_at?: string
          id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_notes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          activity_checked_at: string | null
          address: string | null
          business_status: string | null
          category: string | null
          created_at: string
          discovery_run_id: string | null
          emails: string[]
          id: string
          last_activity_at: string | null
          last_investigated_at: string | null
          last_opened_at: string | null
          latitude: number | null
          longitude: number | null
          maps_url: string | null
          name: string
          open_now: boolean | null
          opening_hours: Json
          owner_id: string
          phone: string | null
          place_id: string
          rating: number | null
          recent_reviews: Json
          review_count: number | null
          reviews_last_90d: number | null
          score: number | null
          socials: Json
          source: string
          status: string
          updated_at: string
          visibility_score: number | null
          website: string | null
          website_check: Json
          website_checked_at: string | null
          website_source: string | null
        }
        Insert: {
          activity_checked_at?: string | null
          address?: string | null
          business_status?: string | null
          category?: string | null
          created_at?: string
          discovery_run_id?: string | null
          emails?: string[]
          id?: string
          last_activity_at?: string | null
          last_investigated_at?: string | null
          last_opened_at?: string | null
          latitude?: number | null
          longitude?: number | null
          maps_url?: string | null
          name: string
          open_now?: boolean | null
          opening_hours?: Json
          owner_id?: string
          phone?: string | null
          place_id: string
          rating?: number | null
          recent_reviews?: Json
          review_count?: number | null
          reviews_last_90d?: number | null
          score?: number | null
          socials?: Json
          source?: string
          status?: string
          updated_at?: string
          visibility_score?: number | null
          website?: string | null
          website_check?: Json
          website_checked_at?: string | null
          website_source?: string | null
        }
        Update: {
          activity_checked_at?: string | null
          address?: string | null
          business_status?: string | null
          category?: string | null
          created_at?: string
          discovery_run_id?: string | null
          emails?: string[]
          id?: string
          last_activity_at?: string | null
          last_investigated_at?: string | null
          last_opened_at?: string | null
          latitude?: number | null
          longitude?: number | null
          maps_url?: string | null
          name?: string
          open_now?: boolean | null
          opening_hours?: Json
          owner_id?: string
          phone?: string | null
          place_id?: string
          rating?: number | null
          recent_reviews?: Json
          review_count?: number | null
          reviews_last_90d?: number | null
          score?: number | null
          socials?: Json
          source?: string
          status?: string
          updated_at?: string
          visibility_score?: number | null
          website?: string | null
          website_check?: Json
          website_checked_at?: string | null
          website_source?: string | null
        }
        Relationships: []
      }
      discovery_runs: {
        Row: {
          archived: boolean
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          location: string | null
          new_count: number
          owner_id: string
          query: string
          rerun_of: string | null
          results_count: number
          status: string
          title: string | null
        }
        Insert: {
          archived?: boolean
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          location?: string | null
          new_count?: number
          owner_id?: string
          query: string
          rerun_of?: string | null
          results_count?: number
          status?: string
          title?: string | null
        }
        Update: {
          archived?: boolean
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          location?: string | null
          new_count?: number
          owner_id?: string
          query?: string
          rerun_of?: string | null
          results_count?: number
          status?: string
          title?: string | null
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
      invoices: {
        Row: {
          amount: number
          business_id: string | null
          created_at: string
          currency: string
          due_at: string | null
          id: string
          issued_at: string
          notes: string | null
          number: string
          owner_id: string
          paid_at: string | null
          proposal_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          business_id?: string | null
          created_at?: string
          currency?: string
          due_at?: string | null
          id?: string
          issued_at?: string
          notes?: string | null
          number: string
          owner_id?: string
          paid_at?: string | null
          proposal_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string | null
          created_at?: string
          currency?: string
          due_at?: string | null
          id?: string
          issued_at?: string
          notes?: string | null
          number?: string
          owner_id?: string
          paid_at?: string | null
          proposal_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          default_price: number | null
          deliverables: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string
          position: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          default_price?: number | null
          deliverables?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id?: string
          position?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          default_price?: number | null
          deliverables?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      proposal_versions: {
        Row: {
          body: string
          created_at: string
          id: string
          note: string | null
          owner_id: string
          proposal_id: string
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          note?: string | null
          owner_id?: string
          proposal_id: string
          version: number
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          note?: string | null
          owner_id?: string
          proposal_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_versions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          body: string
          business_id: string
          channel: string | null
          created_at: string
          currency: string
          current_version: number
          id: string
          investigation_id: string | null
          language: string
          mode: string
          offer: string | null
          outcome: string | null
          owner_id: string
          price: number | null
          sent_at: string | null
          sent_channel: string | null
          status: string
          title: string | null
          tone: string | null
          updated_at: string
          why: Json
        }
        Insert: {
          body?: string
          business_id: string
          channel?: string | null
          created_at?: string
          currency?: string
          current_version?: number
          id?: string
          investigation_id?: string | null
          language?: string
          mode: string
          offer?: string | null
          outcome?: string | null
          owner_id?: string
          price?: number | null
          sent_at?: string | null
          sent_channel?: string | null
          status?: string
          title?: string | null
          tone?: string | null
          updated_at?: string
          why?: Json
        }
        Update: {
          body?: string
          business_id?: string
          channel?: string | null
          created_at?: string
          currency?: string
          current_version?: number
          id?: string
          investigation_id?: string | null
          language?: string
          mode?: string
          offer?: string | null
          outcome?: string | null
          owner_id?: string
          price?: number | null
          sent_at?: string | null
          sent_channel?: string | null
          status?: string
          title?: string | null
          tone?: string | null
          updated_at?: string
          why?: Json
        }
        Relationships: [
          {
            foreignKeyName: "proposals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      search_run_results: {
        Row: {
          business_id: string
          created_at: string
          id: string
          owner_id: string
          run_id: string
          was_new: boolean
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          owner_id?: string
          run_id: string
          was_new?: boolean
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          owner_id?: string
          run_id?: string
          was_new?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "search_run_results_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_run_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "discovery_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          business_id: string | null
          completed_at: string | null
          created_at: string
          dedupe_key: string | null
          description: string | null
          due_at: string | null
          id: string
          owner_id: string
          priority: string
          proposal_id: string | null
          source: string
          status: string
          title: string
        }
        Insert: {
          business_id?: string | null
          completed_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          owner_id?: string
          priority?: string
          proposal_id?: string | null
          source?: string
          status?: string
          title: string
        }
        Update: {
          business_id?: string | null
          completed_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          owner_id?: string
          priority?: string
          proposal_id?: string | null
          source?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          last_visit_at: string | null
          min_prices: Json
          owner_id: string
          previous_visit_at: string | null
          updated_at: string
        }
        Insert: {
          last_visit_at?: string | null
          min_prices?: Json
          owner_id?: string
          previous_visit_at?: string | null
          updated_at?: string
        }
        Update: {
          last_visit_at?: string | null
          min_prices?: Json
          owner_id?: string
          previous_visit_at?: string | null
          updated_at?: string
        }
        Relationships: []
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
