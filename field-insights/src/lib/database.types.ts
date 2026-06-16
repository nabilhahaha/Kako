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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      action_plans: {
        Row: {
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          description: string
          id: string
          issue_id: string | null
          opportunity_id: string | null
          responsible_id: string | null
          status: Database["public"]["Enums"]["action_status"]
          target_date: string | null
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          description: string
          id?: string
          issue_id?: string | null
          opportunity_id?: string | null
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          target_date?: string | null
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          description?: string
          id?: string
          issue_id?: string | null
          opportunity_id?: string | null
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          target_date?: string | null
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_plans_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          city: string | null
          created_at: string
          id: string
          name: string
          region_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          name: string
          region_id: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          name?: string
          region_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_scores: {
        Row: {
          assessment_id: string
          dimension_id: string | null
          dimension_key: string
          id: string
          notes: string | null
          score: number | null
        }
        Insert: {
          assessment_id: string
          dimension_id?: string | null
          dimension_key: string
          id?: string
          notes?: string | null
          score?: number | null
        }
        Update: {
          assessment_id?: string
          dimension_id?: string | null
          dimension_key?: string
          id?: string
          notes?: string | null
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_scores_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_scores_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "framework_dimensions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          area_id: string | null
          band_key: string | null
          created_at: string
          customer_id: string | null
          framework_id: string
          id: string
          overall_score: number | null
          region_id: string | null
          sync_status: Database["public"]["Enums"]["sync_status"]
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          area_id?: string | null
          band_key?: string | null
          created_at?: string
          customer_id?: string | null
          framework_id: string
          id?: string
          overall_score?: number | null
          region_id?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          area_id?: string | null
          band_key?: string | null
          created_at?: string
          customer_id?: string | null
          framework_id?: string
          id?: string
          overall_score?: number | null
          region_id?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          area_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          filename: string | null
          id: string
          kind: string | null
          mime_type: string | null
          region_id: string | null
          size_bytes: number | null
          storage_path: string
          sync_status: Database["public"]["Enums"]["sync_status"]
          uploaded_by: string | null
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          filename?: string | null
          id?: string
          kind?: string | null
          mime_type?: string | null
          region_id?: string | null
          size_bytes?: number | null
          storage_path: string
          sync_status?: Database["public"]["Enums"]["sync_status"]
          uploaded_by?: string | null
        }
        Update: {
          area_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          filename?: string | null
          id?: string
          kind?: string | null
          mime_type?: string | null
          region_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          sync_status?: Database["public"]["Enums"]["sync_status"]
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff: Json | null
          entity_id: string | null
          entity_type: string
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: never
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: never
        }
        Relationships: []
      }
      companies: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      competitor_observations: {
        Row: {
          competitor_id: string | null
          competitor_name: string | null
          created_at: string
          currency: string | null
          display_quality: Database["public"]["Enums"]["display_quality"] | null
          id: string
          notes: string | null
          price: number | null
          product: string | null
          promotion: string | null
          updated_at: string
          visit_id: string
        }
        Insert: {
          competitor_id?: string | null
          competitor_name?: string | null
          created_at?: string
          currency?: string | null
          display_quality?:
            | Database["public"]["Enums"]["display_quality"]
            | null
          id?: string
          notes?: string | null
          price?: number | null
          product?: string | null
          promotion?: string | null
          updated_at?: string
          visit_id: string
        }
        Update: {
          competitor_id?: string | null
          competitor_name?: string | null
          created_at?: string
          currency?: string | null
          display_quality?:
            | Database["public"]["Enums"]["display_quality"]
            | null
          id?: string
          notes?: string | null
          price?: number | null
          product?: string | null
          promotion?: string | null
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_observations_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_observations_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_price_points: {
        Row: {
          area_id: string | null
          captured_at: string
          competitor_id: string | null
          competitor_name: string | null
          currency: string | null
          customer_id: string | null
          id: string
          on_promotion: boolean | null
          our_price: number | null
          pack_size: string | null
          photo_id: string | null
          price_gap_pct: number | null
          product: string
          promo_price: number | null
          region_id: string | null
          shelf_price: number
          sku: string | null
          sku_id: string | null
          sync_status: Database["public"]["Enums"]["sync_status"]
          visit_id: string | null
        }
        Insert: {
          area_id?: string | null
          captured_at?: string
          competitor_id?: string | null
          competitor_name?: string | null
          currency?: string | null
          customer_id?: string | null
          id?: string
          on_promotion?: boolean | null
          our_price?: number | null
          pack_size?: string | null
          photo_id?: string | null
          price_gap_pct?: number | null
          product: string
          promo_price?: number | null
          region_id?: string | null
          shelf_price: number
          sku?: string | null
          sku_id?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          visit_id?: string | null
        }
        Update: {
          area_id?: string | null
          captured_at?: string
          competitor_id?: string | null
          competitor_name?: string | null
          currency?: string | null
          customer_id?: string | null
          id?: string
          on_promotion?: boolean | null
          our_price?: number | null
          pack_size?: string | null
          photo_id?: string | null
          price_gap_pct?: number | null
          product?: string
          promo_price?: number | null
          region_id?: string | null
          shelf_price?: number
          sku?: string | null
          sku_id?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_price_points_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_price_points_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_price_points_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_price_points_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "visit_photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_price_points_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_price_points_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_price_points_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      customer_dev_stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          customer_id: string
          framework_id: string | null
          from_stage_id: string | null
          id: number
          reason: string | null
          to_stage_id: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          customer_id: string
          framework_id?: string | null
          from_stage_id?: string | null
          id?: never
          reason?: string | null
          to_stage_id?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          customer_id?: string
          framework_id?: string | null
          from_stage_id?: string | null
          id?: never
          reason?: string | null
          to_stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_dev_stage_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_dev_stage_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_dev_stage_history_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_dev_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "framework_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_dev_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "framework_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_health_snapshots: {
        Row: {
          captured_at: string
          customer_id: string
          drivers: Json | null
          framework_id: string | null
          health_band_key: string | null
          health_score: number
          id: number
        }
        Insert: {
          captured_at?: string
          customer_id: string
          drivers?: Json | null
          framework_id?: string | null
          health_band_key?: string | null
          health_score: number
          id?: never
        }
        Update: {
          captured_at?: string
          customer_id?: string
          drivers?: Json | null
          framework_id?: string | null
          health_band_key?: string | null
          health_score?: number
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "customer_health_snapshots_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_health_snapshots_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          area_id: string | null
          channel: string | null
          code: string | null
          company_id: string | null
          created_at: string
          deleted_at: string | null
          health_band_key: string | null
          health_framework_id: string | null
          health_score: number | null
          health_updated_at: string | null
          id: string
          is_active: boolean
          name: string
          owner_id: string | null
          region_id: string | null
          segment: string | null
          stage_framework_id: string | null
          stage_id: string | null
          stage_since: string | null
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          channel?: string | null
          code?: string | null
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          health_band_key?: string | null
          health_framework_id?: string | null
          health_score?: number | null
          health_updated_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_id?: string | null
          region_id?: string | null
          segment?: string | null
          stage_framework_id?: string | null
          stage_id?: string | null
          stage_since?: string | null
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          channel?: string | null
          code?: string | null
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          health_band_key?: string | null
          health_framework_id?: string | null
          health_score?: number | null
          health_updated_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string | null
          region_id?: string | null
          segment?: string | null
          stage_framework_id?: string | null
          stage_id?: string | null
          stage_since?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_health_framework_id_fkey"
            columns: ["health_framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_stage_framework_id_fkey"
            columns: ["stage_framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "framework_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          area_id: string | null
          assigned_to: string | null
          created_at: string
          customer_id: string | null
          deleted_at: string | null
          due_date: string | null
          id: string
          issue_id: string | null
          next_visit_id: string | null
          notes: string | null
          opportunity_id: string | null
          region_id: string | null
          status: Database["public"]["Enums"]["follow_up_status"]
          sync_status: Database["public"]["Enums"]["sync_status"]
          title: string
          type: Database["public"]["Enums"]["follow_up_type"]
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          area_id?: string | null
          assigned_to?: string | null
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          issue_id?: string | null
          next_visit_id?: string | null
          notes?: string | null
          opportunity_id?: string | null
          region_id?: string | null
          status?: Database["public"]["Enums"]["follow_up_status"]
          sync_status?: Database["public"]["Enums"]["sync_status"]
          title: string
          type?: Database["public"]["Enums"]["follow_up_type"]
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          area_id?: string | null
          assigned_to?: string | null
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          issue_id?: string | null
          next_visit_id?: string | null
          notes?: string | null
          opportunity_id?: string | null
          region_id?: string | null
          status?: Database["public"]["Enums"]["follow_up_status"]
          sync_status?: Database["public"]["Enums"]["sync_status"]
          title?: string
          type?: Database["public"]["Enums"]["follow_up_type"]
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_next_visit_id_fkey"
            columns: ["next_visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      framework_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_table: string
          framework_id: string | null
          id: number
          new_data: Json | null
          old_data: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table: string
          framework_id?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string
          framework_id?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
        }
        Relationships: []
      }
      framework_bands: {
        Row: {
          color: string | null
          framework_id: string
          id: string
          key: string
          label: string
          max_score: number
          min_score: number
          sort: number
        }
        Insert: {
          color?: string | null
          framework_id: string
          id?: string
          key: string
          label: string
          max_score: number
          min_score: number
          sort?: number
        }
        Update: {
          color?: string | null
          framework_id?: string
          id?: string
          key?: string
          label?: string
          max_score?: number
          min_score?: number
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "framework_bands_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
        ]
      }
      framework_dimensions: {
        Row: {
          config: Json
          framework_id: string
          id: string
          key: string
          label: string
          scale_max: number
          scale_min: number
          sort: number
          weight: number
        }
        Insert: {
          config?: Json
          framework_id: string
          id?: string
          key: string
          label: string
          scale_max?: number
          scale_min?: number
          sort?: number
          weight?: number
        }
        Update: {
          config?: Json
          framework_id?: string
          id?: string
          key?: string
          label?: string
          scale_max?: number
          scale_min?: number
          sort?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "framework_dimensions_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
        ]
      }
      framework_rules: {
        Row: {
          action: Database["public"]["Enums"]["rule_action"]
          action_params: Json
          comparator: Database["public"]["Enums"]["rule_comparator"]
          dimension_id: string | null
          framework_id: string
          id: string
          is_active: boolean
          name: string
          sort: number
          threshold: number
        }
        Insert: {
          action: Database["public"]["Enums"]["rule_action"]
          action_params?: Json
          comparator: Database["public"]["Enums"]["rule_comparator"]
          dimension_id?: string | null
          framework_id: string
          id?: string
          is_active?: boolean
          name: string
          sort?: number
          threshold: number
        }
        Update: {
          action?: Database["public"]["Enums"]["rule_action"]
          action_params?: Json
          comparator?: Database["public"]["Enums"]["rule_comparator"]
          dimension_id?: string | null
          framework_id?: string
          id?: string
          is_active?: boolean
          name?: string
          sort?: number
          threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "framework_rules_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "framework_dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "framework_rules_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
        ]
      }
      framework_stages: {
        Row: {
          config: Json
          framework_id: string
          id: string
          is_entry: boolean
          is_terminal: boolean
          key: string
          label: string
          sort: number
        }
        Insert: {
          config?: Json
          framework_id: string
          id?: string
          is_entry?: boolean
          is_terminal?: boolean
          key: string
          label: string
          sort?: number
        }
        Update: {
          config?: Json
          framework_id?: string
          id?: string
          is_entry?: boolean
          is_terminal?: boolean
          key?: string
          label?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "framework_stages_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
        ]
      }
      frameworks: {
        Row: {
          company_id: string | null
          config: Json
          created_at: string
          description: string | null
          effective_from: string
          effective_to: string | null
          id: string
          industry: string
          is_active: boolean
          is_default: boolean
          key: string
          kind: Database["public"]["Enums"]["framework_kind"]
          name: string
          supersedes_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          company_id?: string | null
          config?: Json
          created_at?: string
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          industry?: string
          is_active?: boolean
          is_default?: boolean
          key: string
          kind: Database["public"]["Enums"]["framework_kind"]
          name: string
          supersedes_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          company_id?: string | null
          config?: Json
          created_at?: string
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          industry?: string
          is_active?: boolean
          is_default?: boolean
          key?: string
          kind?: Database["public"]["Enums"]["framework_kind"]
          name?: string
          supersedes_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "frameworks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "frameworks_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          area_id: string | null
          created_at: string
          customer_id: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: string
          issue_type: Database["public"]["Enums"]["issue_type"]
          owner_id: string | null
          region_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          severity: Database["public"]["Enums"]["severity_level"]
          status: Database["public"]["Enums"]["issue_status"]
          title: string | null
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          issue_type: Database["public"]["Enums"]["issue_type"]
          owner_id?: string | null
          region_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["severity_level"]
          status?: Database["public"]["Enums"]["issue_status"]
          title?: string | null
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          area_id?: string | null
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          issue_type?: Database["public"]["Enums"]["issue_type"]
          owner_id?: string | null
          region_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["severity_level"]
          status?: Database["public"]["Enums"]["issue_status"]
          title?: string | null
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issues_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          customer_id: string
          geofence_radius_m: number | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          customer_id: string
          geofence_radius_m?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string
          geofence_radius_m?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          area_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          customer_id: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          estimated_value: number | null
          expected_close_date: string | null
          forecast_value: number | null
          id: string
          owner_id: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          probability: number
          region_id: string | null
          score: number | null
          score_breakdown: Json | null
          scoring_framework_id: string | null
          status: Database["public"]["Enums"]["opportunity_status"]
          title: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          forecast_value?: number | null
          id?: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          probability?: number
          region_id?: string | null
          score?: number | null
          score_breakdown?: Json | null
          scoring_framework_id?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"]
          title: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          area_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          forecast_value?: number | null
          id?: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          probability?: number
          region_id?: string | null
          score?: number | null
          score_breakdown?: Json | null
          scoring_framework_id?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"]
          title?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_scoring_framework_id_fkey"
            columns: ["scoring_framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          area_id: string | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          manager_id: string | null
          phone: string | null
          region_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id: string
          is_active?: boolean
          manager_id?: string | null
          phone?: string | null
          region_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          manager_id?: string | null
          phone?: string | null
          region_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      route_stops: {
        Row: {
          created_at: string
          customer_id: string | null
          id: string
          planned: boolean
          route_id: string
          seq: number
          status: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          id?: string
          planned?: boolean
          route_id: string
          seq?: number
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          id?: string
          planned?: boolean
          route_id?: string
          seq?: number
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_stops_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "v_route_performance"
            referencedColumns: ["route_id"]
          },
          {
            foreignKeyName: "route_stops_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          area_id: string | null
          company_id: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          owner_id: string | null
          region_id: string | null
          route_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          owner_id?: string | null
          region_id?: string | null
          route_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string | null
          region_id?: string | null
          route_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      skus: {
        Row: {
          barcode: string | null
          brand: string | null
          category: string | null
          code: string | null
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          pack_size: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          code?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          pack_size?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          code?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          pack_size?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skus_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_photos: {
        Row: {
          category: Database["public"]["Enums"]["photo_category"]
          competitor_observation_id: string | null
          created_at: string
          description: string | null
          id: string
          latitude: number | null
          longitude: number | null
          storage_path: string
          sync_status: Database["public"]["Enums"]["sync_status"]
          taken_at: string
          visit_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["photo_category"]
          competitor_observation_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          storage_path: string
          sync_status?: Database["public"]["Enums"]["sync_status"]
          taken_at?: string
          visit_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["photo_category"]
          competitor_observation_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          storage_path?: string
          sync_status?: Database["public"]["Enums"]["sync_status"]
          taken_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_photos_competitor_observation_id_fkey"
            columns: ["competitor_observation_id"]
            isOneToOne: false
            referencedRelation: "competitor_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_photos_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          area_id: string | null
          created_at: string
          customer_id: string
          deleted_at: string | null
          ended_at: string | null
          gps_accuracy_m: number | null
          gps_in_range: boolean | null
          id: string
          location_id: string | null
          objective: string | null
          outcome: string | null
          quality_breakdown: Json | null
          quality_framework_id: string | null
          quality_score: number | null
          region_id: string | null
          start_latitude: number | null
          start_longitude: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["visit_status"]
          summary: string | null
          sync_status: Database["public"]["Enums"]["sync_status"]
          updated_at: string
          user_id: string
          visit_type: Database["public"]["Enums"]["visit_type"]
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          ended_at?: string | null
          gps_accuracy_m?: number | null
          gps_in_range?: boolean | null
          id?: string
          location_id?: string | null
          objective?: string | null
          outcome?: string | null
          quality_breakdown?: Json | null
          quality_framework_id?: string | null
          quality_score?: number | null
          region_id?: string | null
          start_latitude?: number | null
          start_longitude?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          summary?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
          user_id: string
          visit_type: Database["public"]["Enums"]["visit_type"]
        }
        Update: {
          area_id?: string | null
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          ended_at?: string | null
          gps_accuracy_m?: number | null
          gps_in_range?: boolean | null
          id?: string
          location_id?: string | null
          objective?: string | null
          outcome?: string | null
          quality_breakdown?: Json | null
          quality_framework_id?: string | null
          quality_score?: number | null
          region_id?: string | null
          start_latitude?: number | null
          start_longitude?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          summary?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
          user_id?: string
          visit_type?: Database["public"]["Enums"]["visit_type"]
        }
        Relationships: [
          {
            foreignKeyName: "visits_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_quality_framework_id_fkey"
            columns: ["quality_framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_notes: {
        Row: {
          created_at: string
          duration_seconds: number | null
          id: string
          storage_path: string
          sync_status: Database["public"]["Enums"]["sync_status"]
          transcript: string | null
          transcription_status: string | null
          visit_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          storage_path: string
          sync_status?: Database["public"]["Enums"]["sync_status"]
          transcript?: string | null
          transcription_status?: string | null
          visit_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          storage_path?: string
          sync_status?: Database["public"]["Enums"]["sync_status"]
          transcript?: string | null
          transcription_status?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_notes_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_actions_due: {
        Row: {
          completed_at: string | null
          completion_notes: string | null
          created_at: string | null
          description: string | null
          id: string | null
          issue_id: string | null
          opportunity_id: string | null
          responsible_id: string | null
          status: Database["public"]["Enums"]["action_status"] | null
          target_date: string | null
          updated_at: string | null
          visit_id: string | null
        }
        Insert: {
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          issue_id?: string | null
          opportunity_id?: string | null
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["action_status"] | null
          target_date?: string | null
          updated_at?: string | null
          visit_id?: string | null
        }
        Update: {
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          issue_id?: string | null
          opportunity_id?: string | null
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["action_status"] | null
          target_date?: string | null
          updated_at?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_plans_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      v_competitor_price_latest: {
        Row: {
          captured_at: string | null
          competitor_id: string | null
          price_gap_pct: number | null
          product: string | null
          promo_price: number | null
          shelf_price: number | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_price_points_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_customer_health_dist: {
        Row: {
          health_band_key: string | null
          n: number | null
        }
        Relationships: []
      }
      v_dvap_by_area: {
        Row: {
          area_id: string | null
          avail: number | null
          dist: number | null
          overall: number | null
          price: number | null
          promo: number | null
          vis: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      v_issues_by_category: {
        Row: {
          issue_type: Database["public"]["Enums"]["issue_type"] | null
          n: number | null
          status: Database["public"]["Enums"]["issue_status"] | null
        }
        Relationships: []
      }
      v_pipeline_forecast: {
        Row: {
          area_id: string | null
          gross_value: number | null
          n: number | null
          status: Database["public"]["Enums"]["opportunity_status"] | null
          weighted_value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      v_route_performance: {
        Row: {
          area_id: string | null
          completed_stops: number | null
          completion_pct: number | null
          name: string | null
          owner_id: string | null
          planned_stops: number | null
          route_date: string | null
          route_id: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_visits_by_city: {
        Row: {
          city: string | null
          visits: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      fi_can_access_area: { Args: { target_area: string }; Returns: boolean }
      fi_can_see_visit: { Args: { p: string }; Returns: boolean }
      fi_default_framework: {
        Args: {
          p_industry?: string
          p_kind: Database["public"]["Enums"]["framework_kind"]
        }
        Returns: string
      }
      fi_is_admin: { Args: never; Returns: boolean }
      fi_my_area: { Args: never; Returns: string }
      fi_my_region: { Args: never; Returns: string }
      fi_recompute_assessment: { Args: { p_id: string }; Returns: undefined }
      fi_recompute_customer_health: {
        Args: { p_customer: string }
        Returns: undefined
      }
      fi_recompute_visit_quality: {
        Args: { p_visit: string }
        Returns: undefined
      }
      fi_resolve_framework: {
        Args: {
          p_at?: string
          p_company?: string
          p_industry?: string
          p_kind: Database["public"]["Enums"]["framework_kind"]
        }
        Returns: string
      }
      fi_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
    }
    Enums: {
      action_status: "not_started" | "in_progress" | "completed" | "cancelled"
      display_quality: "poor" | "fair" | "good" | "excellent"
      follow_up_status: "scheduled" | "in_progress" | "done" | "cancelled"
      follow_up_type: "callback" | "next_visit" | "task" | "escalation"
      framework_kind:
        | "assessment"
        | "health"
        | "visit_quality"
        | "opportunity_scoring"
        | "stage_model"
      issue_status: "open" | "in_progress" | "resolved" | "closed"
      issue_type:
        | "out_of_stock"
        | "pricing_issue"
        | "distribution_issue"
        | "visibility_issue"
        | "customer_complaint"
        | "competitor_threat"
      opportunity_status: "open" | "in_progress" | "closed_won" | "closed_lost"
      photo_category:
        | "store_front"
        | "shelf"
        | "display"
        | "promotion"
        | "competitor_activity"
        | "price_tag"
        | "product_availability"
        | "other"
      priority_level: "low" | "medium" | "high" | "critical"
      rule_action:
        | "spawn_issue"
        | "spawn_opportunity"
        | "spawn_action"
        | "spawn_follow_up"
        | "flag"
        | "set_band"
      rule_comparator: "lt" | "lte" | "gt" | "gte" | "eq" | "neq"
      severity_level: "low" | "medium" | "high" | "critical"
      sync_status: "pending" | "synced" | "failed"
      user_role:
        | "platform_admin"
        | "business_manager"
        | "regional_manager"
        | "area_manager"
        | "supervisor"
        | "field_user"
        | "viewer"
      visit_status: "draft" | "in_progress" | "completed" | "cancelled"
      visit_type:
        | "follow_up"
        | "new_customer"
        | "competitor_check"
        | "market_survey"
        | "merchandising_audit"
        | "complaint_investigation"
        | "trade_marketing_visit"
        | "distributor_visit"
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
  public: {
    Enums: {
      action_status: ["not_started", "in_progress", "completed", "cancelled"],
      display_quality: ["poor", "fair", "good", "excellent"],
      follow_up_status: ["scheduled", "in_progress", "done", "cancelled"],
      follow_up_type: ["callback", "next_visit", "task", "escalation"],
      framework_kind: [
        "assessment",
        "health",
        "visit_quality",
        "opportunity_scoring",
        "stage_model",
      ],
      issue_status: ["open", "in_progress", "resolved", "closed"],
      issue_type: [
        "out_of_stock",
        "pricing_issue",
        "distribution_issue",
        "visibility_issue",
        "customer_complaint",
        "competitor_threat",
      ],
      opportunity_status: ["open", "in_progress", "closed_won", "closed_lost"],
      photo_category: [
        "store_front",
        "shelf",
        "display",
        "promotion",
        "competitor_activity",
        "price_tag",
        "product_availability",
        "other",
      ],
      priority_level: ["low", "medium", "high", "critical"],
      rule_action: [
        "spawn_issue",
        "spawn_opportunity",
        "spawn_action",
        "spawn_follow_up",
        "flag",
        "set_band",
      ],
      rule_comparator: ["lt", "lte", "gt", "gte", "eq", "neq"],
      severity_level: ["low", "medium", "high", "critical"],
      sync_status: ["pending", "synced", "failed"],
      user_role: [
        "platform_admin",
        "business_manager",
        "regional_manager",
        "area_manager",
        "supervisor",
        "field_user",
        "viewer",
      ],
      visit_status: ["draft", "in_progress", "completed", "cancelled"],
      visit_type: [
        "follow_up",
        "new_customer",
        "competitor_check",
        "market_survey",
        "merchandising_audit",
        "complaint_investigation",
        "trade_marketing_visit",
        "distributor_visit",
      ],
    },
  },
} as const
