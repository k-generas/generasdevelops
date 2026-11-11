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
      business_audits: {
        Row: {
          id: string
          owner_id: string
          business_id: string
          status: string
          findings_json: Json
          evidence_log_json: Json
          summary_json: Json
          score_0_100: number | null
          started_at: string
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id?: string
          business_id: string
          status?: string
          findings_json?: Json
          evidence_log_json?: Json
          summary_json?: Json
          score_0_100?: number | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          business_id?: string
          status?: string
          findings_json?: Json
          evidence_log_json?: Json
          summary_json?: Json
          score_0_100?: number | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_audits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
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
      business_facts: {
        Row: {
          business_id: string
          confidence: number
          created_at: string
          excerpt: string | null
          field: string
          id: string
          method: string
          observed_at: string
          owner_id: string
          source_id: string | null
          source_name: string
          source_type: string
          status: string
          url: string | null
          value: Json | null
        }
        Insert: {
          business_id: string
          confidence?: number
          created_at?: string
          excerpt?: string | null
          field: string
          id?: string
          method?: string
          observed_at?: string
          owner_id?: string
          source_id?: string | null
          source_name: string
          source_type?: string
          status?: string
          url?: string | null
          value?: Json | null
        }
        Update: {
          business_id?: string
          confidence?: number
          created_at?: string
          excerpt?: string | null
          field?: string
          id?: string
          method?: string
          observed_at?: string
          owner_id?: string
          source_id?: string | null
          source_name?: string
          source_type?: string
          status?: string
          url?: string | null
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "business_facts_business_id_fkey"
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
      business_sources: {
        Row: {
          business_id: string
          confidence: number
          created_at: string
          excerpt: string | null
          first_seen_at: string
          id: string
          last_checked_at: string
          last_verified_at: string | null
          method: string
          owner_id: string
          source_id: string
          source_name: string
          source_type: string
          status: string
          url: string | null
        }
        Insert: {
          business_id: string
          confidence?: number
          created_at?: string
          excerpt?: string | null
          first_seen_at?: string
          id?: string
          last_checked_at?: string
          last_verified_at?: string | null
          method?: string
          owner_id?: string
          source_id: string
          source_name: string
          source_type?: string
          status?: string
          url?: string | null
        }
        Update: {
          business_id?: string
          confidence?: number
          created_at?: string
          excerpt?: string | null
          first_seen_at?: string
          id?: string
          last_checked_at?: string
          last_verified_at?: string | null
          method?: string
          owner_id?: string
          source_id?: string
          source_name?: string
          source_type?: string
          status?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_sources_business_id_fkey"
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
          business_model: string | null
          business_status: string | null
          category: string | null
          cell: string | null
          contact_page: string | null
          contact_suppressed: boolean
          created_at: string
          description: string | null
          discovery_run_id: string | null
          district: string | null
          emails: string[]
          employee_count_status: string
          employees_max: number | null
          employees_min: number | null
          exports: boolean | null
          founded_date: string | null
          founded_status: string
          id: string
          industry: string | null
          industry_secondary: string | null
          intel_updated_at: string | null
          last_activity_at: string | null
          last_contacted_at: string | null
          last_investigated_at: string | null
          last_opened_at: string | null
          latitude: number | null
          legal_name: string | null
          legal_structure: string | null
          location_verified: boolean
          longitude: number | null
          maps_url: string | null
          markets_served: string | null
          name: string
          open_now: boolean | null
          opening_hours: Json
          outreach_note: string | null
          outreach_stage: string
          owner_id: string
          parent_organization: string | null
          phone: string | null
          place_id: string
          preferred_channel: string | null
          products_services: string | null
          profile_confidence: string
          profile_verified_at: string | null
          province: string | null
          rating: number | null
          recent_reviews: Json
          registration_date: string | null
          registration_id: string | null
          registration_status: string | null
          review_count: number | null
          reviews_last_90d: number | null
          score: number | null
          sector: string | null
          socials: Json
          source: string
          status: string
          supply_chain_role: string | null
          suppression_reason: string | null
          target_customers: string | null
          trading_names: string[]
          updated_at: string
          validation_plan: Json | null
          visibility_score: number | null
          website: string | null
          website_check: Json
          website_checked_at: string | null
          website_probe: Json
          website_probed_at: string | null
          website_source: string | null
        }
        Insert: {
          activity_checked_at?: string | null
          address?: string | null
          business_model?: string | null
          business_status?: string | null
          category?: string | null
          cell?: string | null
          contact_page?: string | null
          contact_suppressed?: boolean
          created_at?: string
          description?: string | null
          discovery_run_id?: string | null
          district?: string | null
          emails?: string[]
          employee_count_status?: string
          employees_max?: number | null
          employees_min?: number | null
          exports?: boolean | null
          founded_date?: string | null
          founded_status?: string
          id?: string
          industry?: string | null
          industry_secondary?: string | null
          intel_updated_at?: string | null
          last_activity_at?: string | null
          last_contacted_at?: string | null
          last_investigated_at?: string | null
          last_opened_at?: string | null
          latitude?: number | null
          legal_name?: string | null
          legal_structure?: string | null
          location_verified?: boolean
          longitude?: number | null
          maps_url?: string | null
          markets_served?: string | null
          name: string
          open_now?: boolean | null
          opening_hours?: Json
          outreach_note?: string | null
          outreach_stage?: string
          owner_id?: string
          parent_organization?: string | null
          phone?: string | null
          place_id: string
          preferred_channel?: string | null
          products_services?: string | null
          profile_confidence?: string
          profile_verified_at?: string | null
          province?: string | null
          rating?: number | null
          recent_reviews?: Json
          registration_date?: string | null
          registration_id?: string | null
          registration_status?: string | null
          review_count?: number | null
          reviews_last_90d?: number | null
          score?: number | null
          sector?: string | null
          socials?: Json
          source?: string
          status?: string
          supply_chain_role?: string | null
          suppression_reason?: string | null
          target_customers?: string | null
          trading_names?: string[]
          updated_at?: string
          validation_plan?: Json | null
          visibility_score?: number | null
          website?: string | null
          website_check?: Json
          website_checked_at?: string | null
          website_probe?: Json
          website_probed_at?: string | null
          website_source?: string | null
        }
        Update: {
          activity_checked_at?: string | null
          address?: string | null
          business_model?: string | null
          business_status?: string | null
          category?: string | null
          cell?: string | null
          contact_page?: string | null
          contact_suppressed?: boolean
          created_at?: string
          description?: string | null
          discovery_run_id?: string | null
          district?: string | null
          emails?: string[]
          employee_count_status?: string
          employees_max?: number | null
          employees_min?: number | null
          exports?: boolean | null
          founded_date?: string | null
          founded_status?: string
          id?: string
          industry?: string | null
          industry_secondary?: string | null
          intel_updated_at?: string | null
          last_activity_at?: string | null
          last_contacted_at?: string | null
          last_investigated_at?: string | null
          last_opened_at?: string | null
          latitude?: number | null
          legal_name?: string | null
          legal_structure?: string | null
          location_verified?: boolean
          longitude?: number | null
          maps_url?: string | null
          markets_served?: string | null
          name?: string
          open_now?: boolean | null
          opening_hours?: Json
          outreach_note?: string | null
          outreach_stage?: string
          owner_id?: string
          parent_organization?: string | null
          phone?: string | null
          place_id?: string
          preferred_channel?: string | null
          products_services?: string | null
          profile_confidence?: string
          profile_verified_at?: string | null
          province?: string | null
          rating?: number | null
          recent_reviews?: Json
          registration_date?: string | null
          registration_id?: string | null
          registration_status?: string | null
          review_count?: number | null
          reviews_last_90d?: number | null
          score?: number | null
          sector?: string | null
          socials?: Json
          source?: string
          status?: string
          supply_chain_role?: string | null
          suppression_reason?: string | null
          target_customers?: string | null
          trading_names?: string[]
          updated_at?: string
          validation_plan?: Json | null
          visibility_score?: number | null
          website?: string | null
          website_check?: Json
          website_checked_at?: string | null
          website_probe?: Json
          website_probed_at?: string | null
          website_source?: string | null
        }
        Relationships: []
      }
      company_events: {
        Row: {
          business_id: string | null
          created_at: string
          dedupe_key: string | null
          details: Json
          event_kind: string
          first_seen_at: string
          id: string
          last_seen_at: string
          owner_id: string
          source_date: string | null
          source_id: string | null
          source_url: string | null
          status: string
          title: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          details?: Json
          event_kind: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          owner_id?: string
          source_date?: string | null
          source_id?: string | null
          source_url?: string | null
          status?: string
          title: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          details?: Json
          event_kind?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          owner_id?: string
          source_date?: string | null
          source_id?: string | null
          source_url?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_digests: {
        Row: {
          added: number
          category: string
          cost_usd: number
          created_at: string
          district: string | null
          duplicates: number
          error: string | null
          failed_queries: number
          for_date: string
          found: number
          id: string
          new_businesses: Json
          owner_id: string
          queries: number
          read_at: string | null
          run_id: string | null
          scan_id: string | null
          status: string
        }
        Insert: {
          added?: number
          category?: string
          cost_usd?: number
          created_at?: string
          district?: string | null
          duplicates?: number
          error?: string | null
          failed_queries?: number
          for_date?: string
          found?: number
          id?: string
          new_businesses?: Json
          owner_id?: string
          queries?: number
          read_at?: string | null
          run_id?: string | null
          scan_id?: string | null
          status?: string
        }
        Update: {
          added?: number
          category?: string
          cost_usd?: number
          created_at?: string
          district?: string | null
          duplicates?: number
          error?: string | null
          failed_queries?: number
          for_date?: string
          found?: number
          id?: string
          new_businesses?: Json
          owner_id?: string
          queries?: number
          read_at?: string | null
          run_id?: string | null
          scan_id?: string | null
          status?: string
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
      expenses: {
        Row: {
          amount: number
          business_id: string | null
          category: string
          created_at: string
          currency: string
          id: string
          method: string
          notes: string | null
          owner_id: string
          paid_at: string
          reference: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount: number
          business_id?: string | null
          category?: string
          created_at?: string
          currency?: string
          id?: string
          method?: string
          notes?: string | null
          owner_id?: string
          paid_at?: string
          reference?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          business_id?: string | null
          category?: string
          created_at?: string
          currency?: string
          id?: string
          method?: string
          notes?: string | null
          owner_id?: string
          paid_at?: string
          reference?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
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
      maintenance_records: {
        Row: {
          business_id: string
          cadence: string | null
          completed_at: string | null
          completion_note: string | null
          created_at: string
          description: string | null
          id: string
          next_due_at: string | null
          owner_id: string
          recommendation_id: string | null
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          business_id: string
          cadence?: string | null
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          description?: string | null
          id?: string
          next_due_at?: string | null
          owner_id?: string
          recommendation_id?: string | null
          source?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          cadence?: string | null
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          description?: string | null
          id?: string
          next_due_at?: string | null
          owner_id?: string
          recommendation_id?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_records_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "solution_recommendations"
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
      monitoring_settings: {
        Row: {
          category: string
          created_at: string
          district: string | null
          enabled: boolean
          industries: string[]
          last_run_at: string | null
          max_queries: number
          owner_id: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          district?: string | null
          enabled?: boolean
          industries?: string[]
          last_run_at?: string | null
          max_queries?: number
          owner_id?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          district?: string | null
          enabled?: boolean
          industries?: string[]
          last_run_at?: string | null
          max_queries?: number
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      offer_kits: {
        Row: {
          active: boolean
          created_at: string
          deliverables: string[]
          deposit_percent: number | null
          id: string
          notes: string | null
          offer: string
          owner_id: string
          recurring: boolean
          revisions: number | null
          scope_excludes: string[]
          scope_includes: string[]
          timeline_days: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          deliverables?: string[]
          deposit_percent?: number | null
          id?: string
          notes?: string | null
          offer: string
          owner_id?: string
          recurring?: boolean
          revisions?: number | null
          scope_excludes?: string[]
          scope_includes?: string[]
          timeline_days?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          deliverables?: string[]
          deposit_percent?: number | null
          id?: string
          notes?: string | null
          offer?: string
          owner_id?: string
          recurring?: boolean
          revisions?: number | null
          scope_excludes?: string[]
          scope_includes?: string[]
          timeline_days?: number | null
          updated_at?: string
        }
        Relationships: []
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
      opportunities: {
        Row: {
          assigned_owner: string | null
          audit_id: string | null
          business_id: string
          business_impact_hypothesis: string | null
          confidence: number
          created_at: string
          dedupe_key: string | null
          dismissed_reason: string | null
          estimated_effort: string | null
          estimated_project_value: number | null
          evidence: Json
          gaps: Json
          id: string
          identified_problem: string
          investigation_id: string | null
          last_outreach_at: string | null
          last_response_at: string | null
          last_verified_at: string | null
          leak_id: string | null
          next_action: string | null
          outreach_count: number
          owner_id: string
          owner_notes: string | null
          potential_solution: string
          priority: string
          priority_factors: Json
          qualification_assessment: Json
          qualification_stage: string
          recurring: boolean
          relevant_service: string | null
          score: number
          score_factors: Json
          score_reasons: Json
          signal_id: string | null
          social_lead_id: string | null
          social_match_id: string | null
          solution_details: Json
          solution_fits: Json
          source: string
          source_confidence: number | null
          source_status: string | null
          title: string
          updated_at: string
          urgency: string
          validation_questions: Json
          validation_status: string
        }
        Insert: {
          assigned_owner?: string | null
          audit_id?: string | null
          business_id: string
          business_impact_hypothesis?: string | null
          confidence?: number
          created_at?: string
          dedupe_key?: string | null
          dismissed_reason?: string | null
          estimated_effort?: string | null
          estimated_project_value?: number | null
          evidence?: Json
          gaps?: Json
          id?: string
          identified_problem: string
          investigation_id?: string | null
          last_outreach_at?: string | null
          last_response_at?: string | null
          last_verified_at?: string | null
          leak_id?: string | null
          next_action?: string | null
          outreach_count?: number
          owner_id: string
          owner_notes?: string | null
          potential_solution: string
          priority?: string
          priority_factors?: Json
          qualification_assessment?: Json
          qualification_stage?: string
          recurring?: boolean
          relevant_service?: string | null
          score?: number
          score_factors?: Json
          score_reasons?: Json
          signal_id?: string | null
          social_lead_id?: string | null
          social_match_id?: string | null
          solution_details?: Json
          solution_fits?: Json
          source?: string
          source_confidence?: number | null
          source_status?: string | null
          title: string
          updated_at?: string
          urgency?: string
          validation_questions?: Json
          validation_status?: string
        }
        Update: {
          assigned_owner?: string | null
          audit_id?: string | null
          business_id?: string
          business_impact_hypothesis?: string | null
          confidence?: number
          created_at?: string
          dedupe_key?: string | null
          dismissed_reason?: string | null
          estimated_effort?: string | null
          estimated_project_value?: number | null
          evidence?: Json
          gaps?: Json
          id?: string
          identified_problem?: string
          investigation_id?: string | null
          last_outreach_at?: string | null
          last_response_at?: string | null
          last_verified_at?: string | null
          leak_id?: string | null
          next_action?: string | null
          outreach_count?: number
          owner_id?: string
          owner_notes?: string | null
          potential_solution?: string
          priority?: string
          priority_factors?: Json
          qualification_assessment?: Json
          qualification_stage?: string
          recurring?: boolean
          relevant_service?: string | null
          score?: number
          score_factors?: Json
          score_reasons?: Json
          signal_id?: string | null
          social_lead_id?: string | null
          social_match_id?: string | null
          solution_details?: Json
          solution_fits?: Json
          source?: string
          source_confidence?: number | null
          source_status?: string | null
          title?: string
          updated_at?: string
          urgency?: string
          validation_questions?: Json
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "business_audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "investigations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_leak_id_fkey"
            columns: ["leak_id"]
            isOneToOne: false
            referencedRelation: "revenue_leaks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "opportunity_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_social_lead_id_fkey"
            columns: ["social_lead_id"]
            isOneToOne: false
            referencedRelation: "social_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_social_match_id_fkey"
            columns: ["social_match_id"]
            isOneToOne: false
            referencedRelation: "social_business_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_signals: {
        Row: {
          business_id: string
          category: string
          confidence_level: number
          created_at: string
          description: string
          detected_at: string
          evidence_source: string
          id: string
          industry: string | null
          last_verification_date: string | null
          location: string | null
          metadata: Json
          owner_id: string
          possible_business_need: string
          priority: string
          published_at: string | null
          relevant_generas_service: Json
          source_url: string | null
          status: string
          suggested_investigation: string
          suggested_validation_question: string
          updated_at: string
        }
        Insert: {
          business_id: string
          category: string
          confidence_level?: number
          created_at?: string
          description: string
          detected_at?: string
          evidence_source: string
          id?: string
          industry?: string | null
          last_verification_date?: string | null
          location?: string | null
          metadata?: Json
          owner_id: string
          possible_business_need: string
          priority?: string
          published_at?: string | null
          relevant_generas_service?: Json
          source_url?: string | null
          status?: string
          suggested_investigation: string
          suggested_validation_question: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          category?: string
          confidence_level?: number
          created_at?: string
          description?: string
          detected_at?: string
          evidence_source?: string
          id?: string
          industry?: string | null
          last_verification_date?: string | null
          location?: string | null
          metadata?: Json
          owner_id?: string
          possible_business_need?: string
          priority?: string
          published_at?: string | null
          relevant_generas_service?: Json
          source_url?: string | null
          status?: string
          suggested_investigation?: string
          suggested_validation_question?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_signals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount: number
          business_id: string | null
          checklist: Json
          created_at: string
          currency: string
          due_at: string | null
          fulfilled_at: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          number: string
          owner_id: string
          proposal_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          business_id?: string | null
          checklist?: Json
          created_at?: string
          currency?: string
          due_at?: string | null
          fulfilled_at?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          number: string
          owner_id?: string
          proposal_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string | null
          checklist?: Json
          created_at?: string
          currency?: string
          due_at?: string | null
          fulfilled_at?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          number?: string
          owner_id?: string
          proposal_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_handoffs: {
        Row: {
          business_id: string | null
          created_at: string
          currency: string
          delivery_value: number
          id: string
          leak_id: string | null
          note: string | null
          owner_cut: number
          owner_id: string
          partner_id: string
          reason: string | null
          service: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          currency?: string
          delivery_value?: number
          id?: string
          leak_id?: string | null
          note?: string | null
          owner_cut?: number
          owner_id?: string
          partner_id: string
          reason?: string | null
          service?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          currency?: string
          delivery_value?: number
          id?: string
          leak_id?: string | null
          note?: string | null
          owner_cut?: number
          owner_id?: string
          partner_id?: string
          reason?: string | null
          service?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_handoffs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_handoffs_leak_id_fkey"
            columns: ["leak_id"]
            isOneToOne: false
            referencedRelation: "revenue_leaks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_handoffs_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          active: boolean
          available_hours_per_week: number
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          currency: string
          districts: string[]
          id: string
          industries: string[]
          kind: string
          name: string
          notes: string | null
          owner_id: string
          rate: number
          services: string[]
          source: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          available_hours_per_week?: number
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          districts?: string[]
          id?: string
          industries?: string[]
          kind?: string
          name: string
          notes?: string | null
          owner_id?: string
          rate?: number
          services?: string[]
          source?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          available_hours_per_week?: number
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          districts?: string[]
          id?: string
          industries?: string[]
          kind?: string
          name?: string
          notes?: string | null
          owner_id?: string
          rate?: number
          services?: string[]
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      professional_business_links: {
        Row: {
          business_id: string
          confidence: number
          created_at: string
          evidence: Json
          id: string
          owner_id: string
          professional_id: string
          relationship_type: string
          role: string | null
          updated_at: string
          verified: boolean
        }
        Insert: {
          business_id: string
          confidence?: number
          created_at?: string
          evidence?: Json
          id?: string
          owner_id?: string
          professional_id: string
          relationship_type?: string
          role?: string | null
          updated_at?: string
          verified?: boolean
        }
        Update: {
          business_id?: string
          confidence?: number
          created_at?: string
          evidence?: Json
          id?: string
          owner_id?: string
          professional_id?: string
          relationship_type?: string
          role?: string | null
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "professional_business_links_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_business_links_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          availability_status: string
          city: string | null
          confidence: number
          country: string | null
          created_at: string
          dedupe_key: string
          do_not_contact: boolean
          evidence: Json
          expertise: string[]
          full_name: string
          headline: string | null
          id: string
          languages: string[]
          last_verified_at: string | null
          notes: string | null
          owner_id: string
          professional_type: string
          profile_url: string | null
          public_email: string | null
          public_phone: string | null
          region: string | null
          relationship_stage: string
          skills: string[]
          source_name: string | null
          source_url: string | null
          updated_at: string
          verification_status: string
          website: string | null
        }
        Insert: {
          availability_status?: string
          city?: string | null
          confidence?: number
          country?: string | null
          created_at?: string
          dedupe_key: string
          do_not_contact?: boolean
          evidence?: Json
          expertise?: string[]
          full_name: string
          headline?: string | null
          id?: string
          languages?: string[]
          last_verified_at?: string | null
          notes?: string | null
          owner_id?: string
          professional_type?: string
          profile_url?: string | null
          public_email?: string | null
          public_phone?: string | null
          region?: string | null
          relationship_stage?: string
          skills?: string[]
          source_name?: string | null
          source_url?: string | null
          updated_at?: string
          verification_status?: string
          website?: string | null
        }
        Update: {
          availability_status?: string
          city?: string | null
          confidence?: number
          country?: string | null
          created_at?: string
          dedupe_key?: string
          do_not_contact?: boolean
          evidence?: Json
          expertise?: string[]
          full_name?: string
          headline?: string | null
          id?: string
          languages?: string[]
          last_verified_at?: string | null
          notes?: string | null
          owner_id?: string
          professional_type?: string
          profile_url?: string | null
          public_email?: string | null
          public_phone?: string | null
          region?: string | null
          relationship_stage?: string
          skills?: string[]
          source_name?: string | null
          source_url?: string | null
          updated_at?: string
          verification_status?: string
          website?: string | null
        }
        Relationships: []
      }
      prospect_lists: {
        Row: {
          created_at: string
          description: string | null
          entity_kind: string
          filter_version: number
          filters: Json
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entity_kind?: string
          filter_version?: number
          filters?: Json
          id?: string
          name: string
          owner_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entity_kind?: string
          filter_version?: number
          filters?: Json
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      outreach_campaigns: {
        Row: {
          audience_kind: string
          created_at: string
          daily_limit: number
          id: string
          name: string
          notes: string | null
          objective: string | null
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          audience_kind?: string
          created_at?: string
          daily_limit?: number
          id?: string
          name: string
          notes?: string | null
          objective?: string | null
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          audience_kind?: string
          created_at?: string
          daily_limit?: number
          id?: string
          name?: string
          notes?: string | null
          objective?: string | null
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      outreach_campaign_steps: {
        Row: {
          active: boolean
          body_template: string
          campaign_id: string
          channel: string
          created_at: string
          delay_days: number
          id: string
          owner_id: string
          requires_approval: boolean
          step_order: number
          subject_template: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          body_template: string
          campaign_id: string
          channel: string
          created_at?: string
          delay_days?: number
          id?: string
          owner_id?: string
          requires_approval?: boolean
          step_order: number
          subject_template?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          body_template?: string
          campaign_id?: string
          channel?: string
          created_at?: string
          delay_days?: number
          id?: string
          owner_id?: string
          requires_approval?: boolean
          step_order?: number
          subject_template?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_campaign_steps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_queue_items: {
        Row: {
          approved_at: string | null
          business_id: string | null
          campaign_id: string
          channel: string
          country: string | null
          created_at: string
          dedupe_key: string
          draft_body: string
          draft_subject: string | null
          eligibility: Json
          id: string
          owner_id: string
          owner_note: string | null
          professional_id: string | null
          recipient_domain: string | null
          recipient_email: string | null
          recipient_name: string
          recipient_phone: string | null
          sent_at: string | null
          status: string
          step_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          business_id?: string | null
          campaign_id: string
          channel: string
          country?: string | null
          created_at?: string
          dedupe_key: string
          draft_body?: string
          draft_subject?: string | null
          eligibility?: Json
          id?: string
          owner_id?: string
          owner_note?: string | null
          professional_id?: string | null
          recipient_domain?: string | null
          recipient_email?: string | null
          recipient_name: string
          recipient_phone?: string | null
          sent_at?: string | null
          status?: string
          step_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          business_id?: string | null
          campaign_id?: string
          channel?: string
          country?: string | null
          created_at?: string
          dedupe_key?: string
          draft_body?: string
          draft_subject?: string | null
          eligibility?: Json
          id?: string
          owner_id?: string
          owner_note?: string | null
          professional_id?: string | null
          recipient_domain?: string | null
          recipient_email?: string | null
          recipient_name?: string
          recipient_phone?: string | null
          sent_at?: string | null
          status?: string
          step_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_queue_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_queue_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_queue_items_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_queue_items_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaign_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          business_id: string | null
          created_at: string
          currency: string
          id: string
          invoice_id: string | null
          method: string
          notes: string | null
          owner_id: string
          received_at: string
          reference: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          business_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          method?: string
          notes?: string | null
          owner_id?: string
          received_at?: string
          reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          method?: string
          notes?: string | null
          owner_id?: string
          received_at?: string
          reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
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
          opportunity_id: string | null
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
          opportunity_id?: string | null
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
          opportunity_id?: string | null
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
          {
            foreignKeyName: "proposals_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          currency: string
          id: string
          notes: string | null
          owner_id: string
          referred_business_id: string | null
          referred_name: string | null
          referrer_business_id: string | null
          referrer_name: string
          reward_type: string
          reward_value: number
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          owner_id?: string
          referred_business_id?: string | null
          referred_name?: string | null
          referrer_business_id?: string | null
          referrer_name: string
          reward_type?: string
          reward_value?: number
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          owner_id?: string
          referred_business_id?: string | null
          referred_name?: string | null
          referrer_business_id?: string | null
          referrer_name?: string
          reward_type?: string
          reward_value?: number
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      revenue_leaks: {
        Row: {
          business_id: string
          business_relevance: string | null
          confidence: number
          created_at: string
          dedupe_key: string
          effort: string | null
          evidence_url: string | null
          hypothesis: boolean
          id: string
          label: string
          limitation: string | null
          next_step: string | null
          observed_at: string | null
          owner_id: string
          problem_key: string
          recurring: boolean
          reviewed_at: string | null
          severity: string
          source: string | null
          status: string
          status_note: string | null
          suggested_offer: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          business_relevance?: string | null
          confidence?: number
          created_at?: string
          dedupe_key: string
          effort?: string | null
          evidence_url?: string | null
          hypothesis?: boolean
          id?: string
          label: string
          limitation?: string | null
          next_step?: string | null
          observed_at?: string | null
          owner_id?: string
          problem_key: string
          recurring?: boolean
          reviewed_at?: string | null
          severity?: string
          source?: string | null
          status?: string
          status_note?: string | null
          suggested_offer?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          business_relevance?: string | null
          confidence?: number
          created_at?: string
          dedupe_key?: string
          effort?: string | null
          evidence_url?: string | null
          hypothesis?: boolean
          id?: string
          label?: string
          limitation?: string | null
          next_step?: string | null
          observed_at?: string | null
          owner_id?: string
          problem_key?: string
          recurring?: boolean
          reviewed_at?: string | null
          severity?: string
          source?: string | null
          status?: string
          status_note?: string | null
          suggested_offer?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_leaks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
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
      social_business_matches: {
        Row: {
          business_id: string
          confidence: number
          created_at: string
          evidence: Json
          id: string
          matched_at: string
          opportunity_gaps: Json
          owner_id: string
          reason: string
          review_note: string | null
          reviewed_at: string | null
          signals: Json
          social_lead_id: string
          solution_fits: Json
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          confidence?: number
          created_at?: string
          evidence?: Json
          id?: string
          matched_at?: string
          opportunity_gaps?: Json
          owner_id?: string
          reason?: string
          review_note?: string | null
          reviewed_at?: string | null
          signals?: Json
          social_lead_id: string
          solution_fits?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          confidence?: number
          created_at?: string
          evidence?: Json
          id?: string
          matched_at?: string
          opportunity_gaps?: Json
          owner_id?: string
          reason?: string
          review_note?: string | null
          reviewed_at?: string | null
          signals?: Json
          social_lead_id?: string
          solution_fits?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_business_matches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_business_matches_social_lead_id_fkey"
            columns: ["social_lead_id"]
            isOneToOne: false
            referencedRelation: "social_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      social_leads: {
        Row: {
          account_type: string
          account_type_evidence: Json
          biography: string | null
          business_id: string | null
          category: string | null
          contact_phone: string | null
          contact_whatsapp: string | null
          created_at: string
          discovery_run_id: string | null
          display_name: string | null
          district: string | null
          engagement_rate: number | null
          evidence: Json
          followers_count: number | null
          handle: string
          id: string
          last_checked_at: string | null
          last_post_at: string | null
          lead_score: number
          match_checked_at: string | null
          media_count: number | null
          needs: Json
          owner_id: string
          platform: string
          profile_url: string
          score_factors: Json
          source: string
          status: string
          store_status: string
          updated_at: string
          website: string | null
          website_status: string
        }
        Insert: {
          account_type?: string
          account_type_evidence?: Json
          biography?: string | null
          business_id?: string | null
          category?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          created_at?: string
          discovery_run_id?: string | null
          display_name?: string | null
          district?: string | null
          engagement_rate?: number | null
          evidence?: Json
          followers_count?: number | null
          handle: string
          id?: string
          last_checked_at?: string | null
          last_post_at?: string | null
          lead_score?: number
          match_checked_at?: string | null
          media_count?: number | null
          needs?: Json
          owner_id?: string
          platform?: string
          profile_url: string
          score_factors?: Json
          source?: string
          status?: string
          store_status?: string
          updated_at?: string
          website?: string | null
          website_status?: string
        }
        Update: {
          account_type?: string
          account_type_evidence?: Json
          biography?: string | null
          business_id?: string | null
          category?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          created_at?: string
          discovery_run_id?: string | null
          display_name?: string | null
          district?: string | null
          engagement_rate?: number | null
          evidence?: Json
          followers_count?: number | null
          handle?: string
          id?: string
          last_checked_at?: string | null
          last_post_at?: string | null
          lead_score?: number
          match_checked_at?: string | null
          media_count?: number | null
          needs?: Json
          owner_id?: string
          platform?: string
          profile_url?: string
          score_factors?: Json
          source?: string
          status?: string
          store_status?: string
          updated_at?: string
          website?: string | null
          website_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_leads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      solution_prompts: {
        Row: {
          created_at: string
          error: string | null
          evidence_refs: Json
          id: string
          model: string | null
          owner_id: string
          platform: string
          prompt: string
          provider: string | null
          quality: Json
          recommendation_id: string
          status: string
          version: number
        }
        Insert: {
          created_at?: string
          error?: string | null
          evidence_refs?: Json
          id?: string
          model?: string | null
          owner_id?: string
          platform: string
          prompt: string
          provider?: string | null
          quality?: Json
          recommendation_id: string
          status?: string
          version?: number
        }
        Update: {
          created_at?: string
          error?: string | null
          evidence_refs?: Json
          id?: string
          model?: string | null
          owner_id?: string
          platform?: string
          prompt?: string
          provider?: string | null
          quality?: Json
          recommendation_id?: string
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "solution_prompts_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "solution_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      solution_recommendations: {
        Row: {
          assumptions: Json
          audit_id: string | null
          business_id: string
          confidence: number
          created_at: string
          dedupe_key: string
          evidence: Json
          hypothesis: boolean
          id: string
          intent: string
          investigation_id: string | null
          maintenance_required: boolean
          opportunity_id: string | null
          owner_id: string
          requested_deliverable: string
          requirements: Json
          solution_type: string
          source: string
          status: string
          summary: string
          title: string
          unknowns: Json
          updated_at: string
          why_recommended: string
        }
        Insert: {
          assumptions?: Json
          audit_id?: string | null
          business_id: string
          confidence?: number
          created_at?: string
          dedupe_key: string
          evidence?: Json
          hypothesis?: boolean
          id?: string
          intent?: string
          investigation_id?: string | null
          maintenance_required?: boolean
          opportunity_id?: string | null
          owner_id?: string
          requested_deliverable?: string
          requirements?: Json
          solution_type: string
          source?: string
          status?: string
          summary: string
          title: string
          unknowns?: Json
          updated_at?: string
          why_recommended: string
        }
        Update: {
          assumptions?: Json
          audit_id?: string | null
          business_id?: string
          confidence?: number
          created_at?: string
          dedupe_key?: string
          evidence?: Json
          hypothesis?: boolean
          id?: string
          intent?: string
          investigation_id?: string | null
          maintenance_required?: boolean
          opportunity_id?: string | null
          owner_id?: string
          requested_deliverable?: string
          requirements?: Json
          solution_type?: string
          source?: string
          status?: string
          summary?: string
          title?: string
          unknowns?: Json
          updated_at?: string
          why_recommended?: string
        }
        Relationships: [
          {
            foreignKeyName: "solution_recommendations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solution_recommendations_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "investigations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solution_recommendations_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solution_recommendations_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "business_audits"
            referencedColumns: ["id"]
          },
        ]
      }
      source_scans: {
        Row: {
          cost_usd: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          items_found: number
          new_items: number
          owner_id: string
          source_id: string
          started_at: string
          status: string
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          items_found?: number
          new_items?: number
          owner_id?: string
          source_id: string
          started_at?: string
          status?: string
        }
        Update: {
          cost_usd?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          items_found?: number
          new_items?: number
          owner_id?: string
          source_id?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      suppression_entries: {
        Row: {
          channel: string
          country: string | null
          created_at: string
          expires_at: string | null
          id: string
          owner_id: string
          reason: string
          scope: string
          source: string | null
          updated_at: string
          value: string
        }
        Insert: {
          channel?: string
          country?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          owner_id?: string
          reason: string
          scope?: string
          source?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          channel?: string
          country?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          owner_id?: string
          reason?: string
          scope?: string
          source?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          business_id: string | null
          canceled_at: string | null
          created_at: string
          currency: string
          id: string
          monthly_value: number
          next_renewal_at: string | null
          notes: string | null
          offer: string
          owner_id: string
          source: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          business_id?: string | null
          canceled_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          monthly_value?: number
          next_renewal_at?: string | null
          notes?: string | null
          offer: string
          owner_id?: string
          source?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string | null
          canceled_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          monthly_value?: number
          next_renewal_at?: string | null
          notes?: string | null
          offer?: string
          owner_id?: string
          source?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
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
          feasibility_defaults: Json
          last_visit_at: string | null
          min_prices: Json
          owner_id: string
          previous_visit_at: string | null
          updated_at: string
        }
        Insert: {
          feasibility_defaults?: Json
          last_visit_at?: string | null
          min_prices?: Json
          owner_id?: string
          previous_visit_at?: string | null
          updated_at?: string
        }
        Update: {
          feasibility_defaults?: Json
          last_visit_at?: string | null
          min_prices?: Json
          owner_id?: string
          previous_visit_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          access_status: Database["public"]["Enums"]["access_status"]
          approved_at: string | null
          approved_by: string | null
          created_at: string
          email: string
          id: string
          is_admin: boolean
          last_login_at: string | null
          login_count: number
          notes: string | null
          rejected_at: string | null
          suspended_at: string | null
          suspended_by: string | null
          updated_at: string
        }
        Insert: {
          access_status?: Database["public"]["Enums"]["access_status"]
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email: string
          id: string
          is_admin?: boolean
          last_login_at?: string | null
          login_count?: number
          notes?: string | null
          rejected_at?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          updated_at?: string
        }
        Update: {
          access_status?: Database["public"]["Enums"]["access_status"]
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email?: string
          id?: string
          is_admin?: boolean
          last_login_at?: string | null
          login_count?: number
          notes?: string | null
          rejected_at?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      access_code_attempts: {
        Row: {
          id: string
          user_id: string | null
          success: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          success?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          success?: boolean
          created_at?: string
        }
        Relationships: []
      }
      access_codes: {
        Row: {
          id: string
          code_hash: string
          code_prefix: string | null
          target_email: string | null
          target_user_id: string | null
          issued_by: string
          expires_at: string
          max_uses: number
          used_count: number
          status: Database["public"]["Enums"]["access_code_status"]
          notes: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code_hash: string
          code_prefix?: string | null
          target_email?: string | null
          target_user_id?: string | null
          issued_by: string
          expires_at: string
          max_uses?: number
          used_count?: number
          status?: Database["public"]["Enums"]["access_code_status"]
          notes?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code_hash?: string
          code_prefix?: string | null
          target_email?: string | null
          target_user_id?: string | null
          issued_by?: string
          expires_at?: string
          max_uses?: number
          used_count?: number
          status?: Database["public"]["Enums"]["access_code_status"]
          notes?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          actor_id: string | null
          actor_email: string | null
          action: Database["public"]["Enums"]["audit_action"]
          target_user_id: string | null
          target_user_email: string | null
          details: Json | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          actor_email?: string | null
          action: Database["public"]["Enums"]["audit_action"]
          target_user_id?: string | null
          target_user_email?: string | null
          details?: Json | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string | null
          actor_email?: string | null
          action?: Database["public"]["Enums"]["audit_action"]
          target_user_id?: string | null
          target_user_email?: string | null
          details?: Json | null
          metadata?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      login_history: {
        Row: {
          id: string
          user_id: string | null
          email: string | null
          event_type: string
          success: boolean
          failure_reason: string | null
          ip_address: string | null
          user_agent: string | null
          correlation_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          email?: string | null
          event_type: string
          success: boolean
          failure_reason?: string | null
          ip_address?: string | null
          user_agent?: string | null
          correlation_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          email?: string | null
          event_type?: string
          success?: boolean
          failure_reason?: string | null
          ip_address?: string | null
          user_agent?: string | null
          correlation_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      record_login_event: {
        Args: {
          p_event_type: string
          p_success: boolean
          p_failure_reason?: string | null
          p_user_agent?: string | null
        }
        Returns: undefined
      }
      redeem_access_code: {
        Args: { p_code: string }
        Returns: Json
      }
      admin_issue_access_code: {
        Args: {
          p_target_email?: string | null
          p_max_uses?: number
          p_expires_in_hours?: number
        }
        Returns: Json
      }
      admin_revoke_access_code: {
        Args: { p_id: string }
        Returns: Json
      }
      admin_set_access_status: {
        Args: {
          p_user_id: string
          p_status: Database["public"]["Enums"]["access_status"]
          p_note?: string | null
        }
        Returns: Json
      }
    }
    Enums: {
      access_status: "pending" | "approved" | "rejected" | "suspended"
      access_code_status: "active" | "used" | "expired" | "revoked"
      audit_action:
        | "user_registered"
        | "user_approved"
        | "user_rejected"
        | "user_suspended"
        | "user_restored"
        | "code_issued"
        | "code_revoked"
        | "code_redeemed"
        | "login_success"
        | "login_failure"
        | "logout"
        | "role_changed"
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
    Enums: {
      access_status: ["pending", "approved", "rejected", "suspended"],
      access_code_status: ["active", "used", "expired", "revoked"],
      audit_action: [
        "user_registered",
        "user_approved",
        "user_rejected",
        "user_suspended",
        "user_restored",
        "code_issued",
        "code_revoked",
        "code_redeemed",
        "login_success",
        "login_failure",
        "logout",
        "role_changed",
      ],
    },
  },
} as const
