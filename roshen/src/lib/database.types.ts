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
      agent: {
        Row: {
          area_manager_id: string | null
          branch_id: string | null
          channel_id: string | null
          city_id: string | null
          code: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          type: Database["public"]["Enums"]["agent_type"]
        }
        Insert: {
          area_manager_id?: string | null
          branch_id?: string | null
          channel_id?: string | null
          city_id?: string | null
          code: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          type?: Database["public"]["Enums"]["agent_type"]
        }
        Update: {
          area_manager_id?: string | null
          branch_id?: string | null
          channel_id?: string | null
          city_id?: string | null
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          type?: Database["public"]["Enums"]["agent_type"]
        }
        Relationships: [
          {
            foreignKeyName: "agent_area_manager_id_fkey"
            columns: ["area_manager_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      area: {
        Row: {
          code: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          region_id: string
        }
        Insert: {
          code?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
          region_id: string
        }
        Update: {
          code?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          region_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "area_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "region"
            referencedColumns: ["id"]
          },
        ]
      }
      branch: {
        Row: {
          area_id: string
          city_id: string | null
          code: string | null
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          area_id: string
          city_id?: string | null
          code?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          area_id?: string
          city_id?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "area"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      business_trip_detail: {
        Row: {
          accommodation: string | null
          country: string | null
          currency: string
          end_date: string | null
          est_flight: number | null
          est_hotel: number | null
          est_other: number | null
          est_per_diem: number | null
          est_transport: number | null
          from_city: string | null
          hotel_required: boolean
          justification: string | null
          num_days: number | null
          purpose: string | null
          request_id: string
          start_date: string | null
          to_city: string | null
          total_estimated: number | null
          transportation_type:
            | Database["public"]["Enums"]["transportation_type"]
            | null
          travel_type: Database["public"]["Enums"]["travel_type"] | null
          traveler_name: string | null
        }
        Insert: {
          accommodation?: string | null
          country?: string | null
          currency?: string
          end_date?: string | null
          est_flight?: number | null
          est_hotel?: number | null
          est_other?: number | null
          est_per_diem?: number | null
          est_transport?: number | null
          from_city?: string | null
          hotel_required?: boolean
          justification?: string | null
          num_days?: number | null
          purpose?: string | null
          request_id: string
          start_date?: string | null
          to_city?: string | null
          total_estimated?: number | null
          transportation_type?:
            | Database["public"]["Enums"]["transportation_type"]
            | null
          travel_type?: Database["public"]["Enums"]["travel_type"] | null
          traveler_name?: string | null
        }
        Update: {
          accommodation?: string | null
          country?: string | null
          currency?: string
          end_date?: string | null
          est_flight?: number | null
          est_hotel?: number | null
          est_other?: number | null
          est_per_diem?: number | null
          est_transport?: number | null
          from_city?: string | null
          hotel_required?: boolean
          justification?: string | null
          num_days?: number | null
          purpose?: string | null
          request_id?: string
          start_date?: string | null
          to_city?: string | null
          total_estimated?: number | null
          transportation_type?:
            | Database["public"]["Enums"]["transportation_type"]
            | null
          travel_type?: Database["public"]["Enums"]["travel_type"] | null
          traveler_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_trip_detail_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "request"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_event: {
        Row: {
          all_day: boolean
          company_id: string
          created_at: string
          end_date: string | null
          id: string
          kind: string
          owner_id: string
          related_task_id: string | null
          start_date: string
          status_color: string | null
          title: string
        }
        Insert: {
          all_day?: boolean
          company_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          kind?: string
          owner_id: string
          related_task_id?: string | null
          start_date: string
          status_color?: string | null
          title: string
        }
        Update: {
          all_day?: boolean
          company_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          kind?: string
          owner_id?: string
          related_task_id?: string | null
          start_date?: string
          status_color?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id"]
          },
        ]
      }
      capability_setup: {
        Row: {
          actual_salesmen: number | null
          agent_id: string | null
          cashvan_available: boolean
          cashvan_required: boolean
          city_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          level: Database["public"]["Enums"]["org_level"]
          notes: string | null
          period_month: string
          region_id: string | null
          required_salesmen: number | null
          supervisor_available: boolean
          supervisor_required: boolean
          updated_at: string
          warehouse_available: boolean
          warehouse_required: boolean
        }
        Insert: {
          actual_salesmen?: number | null
          agent_id?: string | null
          cashvan_available?: boolean
          cashvan_required?: boolean
          city_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          level: Database["public"]["Enums"]["org_level"]
          notes?: string | null
          period_month: string
          region_id?: string | null
          required_salesmen?: number | null
          supervisor_available?: boolean
          supervisor_required?: boolean
          updated_at?: string
          warehouse_available?: boolean
          warehouse_required?: boolean
        }
        Update: {
          actual_salesmen?: number | null
          agent_id?: string | null
          cashvan_available?: boolean
          cashvan_required?: boolean
          city_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          level?: Database["public"]["Enums"]["org_level"]
          notes?: string | null
          period_month?: string
          region_id?: string | null
          required_salesmen?: number | null
          supervisor_available?: boolean
          supervisor_required?: boolean
          updated_at?: string
          warehouse_available?: boolean
          warehouse_required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "capability_setup_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capability_setup_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capability_setup_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capability_setup_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capability_setup_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "region"
            referencedColumns: ["id"]
          },
        ]
      }
      channel: {
        Row: {
          code: string | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          code?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          code?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      city: {
        Row: {
          company_id: string
          id: string
          name: string
          region_id: string | null
        }
        Insert: {
          company_id: string
          id?: string
          name: string
          region_id?: string | null
        }
        Update: {
          company_id?: string
          id?: string
          name?: string
          region_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "city_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "city_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "region"
            referencedColumns: ["id"]
          },
        ]
      }
      column_mapping_profile: {
        Row: {
          agent_id: string
          company_id: string
          created_at: string
          created_by: string | null
          current_version_id: string | null
          id: string
          is_default: boolean
          name: string
          status: Database["public"]["Enums"]["mapping_status"]
          updated_at: string
        }
        Insert: {
          agent_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          id?: string
          is_default?: boolean
          name?: string
          status?: Database["public"]["Enums"]["mapping_status"]
          updated_at?: string
        }
        Update: {
          agent_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          id?: string
          is_default?: boolean
          name?: string
          status?: Database["public"]["Enums"]["mapping_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "column_mapping_profile_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "column_mapping_profile_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "column_mapping_profile_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_profile_current_version"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "column_mapping_version"
            referencedColumns: ["id"]
          },
        ]
      }
      column_mapping_version: {
        Row: {
          agent_id: string
          company_id: string
          created_at: string
          created_by: string | null
          discount_handling: Database["public"]["Enums"]["discount_handling"]
          field_mapping: Json
          id: string
          notes: string | null
          profile_id: string
          returns_handling: Database["public"]["Enums"]["returns_handling"]
          sales_value_basis: Database["public"]["Enums"]["sales_value_basis"]
          sla_actual_basis: Database["public"]["Enums"]["sla_actual_basis"]
          source_headers: Json
          status: Database["public"]["Enums"]["mapping_status"]
          updated_at: string
          value_mapping: Json | null
          vat_handling: Database["public"]["Enums"]["vat_handling"]
          vat_rate: number
          version_number: number
        }
        Insert: {
          agent_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          discount_handling?: Database["public"]["Enums"]["discount_handling"]
          field_mapping: Json
          id?: string
          notes?: string | null
          profile_id: string
          returns_handling?: Database["public"]["Enums"]["returns_handling"]
          sales_value_basis?: Database["public"]["Enums"]["sales_value_basis"]
          sla_actual_basis?: Database["public"]["Enums"]["sla_actual_basis"]
          source_headers: Json
          status?: Database["public"]["Enums"]["mapping_status"]
          updated_at?: string
          value_mapping?: Json | null
          vat_handling?: Database["public"]["Enums"]["vat_handling"]
          vat_rate?: number
          version_number: number
        }
        Update: {
          agent_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          discount_handling?: Database["public"]["Enums"]["discount_handling"]
          field_mapping?: Json
          id?: string
          notes?: string | null
          profile_id?: string
          returns_handling?: Database["public"]["Enums"]["returns_handling"]
          sales_value_basis?: Database["public"]["Enums"]["sales_value_basis"]
          sla_actual_basis?: Database["public"]["Enums"]["sla_actual_basis"]
          source_headers?: Json
          status?: Database["public"]["Enums"]["mapping_status"]
          updated_at?: string
          value_mapping?: Json | null
          vat_handling?: Database["public"]["Enums"]["vat_handling"]
          vat_rate?: number
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "column_mapping_version_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "column_mapping_version_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "column_mapping_version_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "column_mapping_version_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "column_mapping_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      company: {
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
      country: {
        Row: {
          company_id: string
          created_at: string
          id: string
          iso_code: string | null
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          iso_code?: string | null
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          iso_code?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "country_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_target: {
        Row: {
          agent_id: string | null
          channel_id: string | null
          city_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          level: Database["public"]["Enums"]["org_level"]
          period_month: string
          region_id: string | null
          required_active_customers: number | null
          required_coverage_pct: number | null
          required_customer_universe: number | null
          required_productive_pct: number | null
          required_visits: number | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          channel_id?: string | null
          city_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          level: Database["public"]["Enums"]["org_level"]
          period_month: string
          region_id?: string | null
          required_active_customers?: number | null
          required_coverage_pct?: number | null
          required_customer_universe?: number | null
          required_productive_pct?: number | null
          required_visits?: number | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          channel_id?: string | null
          city_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          level?: Database["public"]["Enums"]["org_level"]
          period_month?: string
          region_id?: string | null
          required_active_customers?: number | null
          required_coverage_pct?: number | null
          required_customer_universe?: number | null
          required_productive_pct?: number | null
          required_visits?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coverage_target_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_target_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_target_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_target_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_target_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_target_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "region"
            referencedColumns: ["id"]
          },
        ]
      }
      customer: {
        Row: {
          channel_id: string | null
          city_id: string | null
          company_id: string
          created_at: string
          customer_code: string
          customer_name: string | null
          id: string
        }
        Insert: {
          channel_id?: string | null
          city_id?: string | null
          company_id: string
          created_at?: string
          customer_code: string
          customer_name?: string | null
          id?: string
        }
        Update: {
          channel_id?: string | null
          city_id?: string | null
          company_id?: string
          created_at?: string
          customer_code?: string
          customer_name?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_line: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          currency: string
          description: string | null
          expense_date: string | null
          id: string
          merchant: string | null
          payment_method: string | null
          receipt_required: boolean
          request_id: string
          vat_amount: number | null
        }
        Insert: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          currency?: string
          description?: string | null
          expense_date?: string | null
          id?: string
          merchant?: string | null
          payment_method?: string | null
          receipt_required?: boolean
          request_id: string
          vat_amount?: number | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          currency?: string
          description?: string | null
          expense_date?: string | null
          id?: string
          merchant?: string | null
          payment_method?: string | null
          receipt_required?: boolean
          request_id?: string
          vat_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_line_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "request"
            referencedColumns: ["id"]
          },
        ]
      }
      file_asset: {
        Row: {
          archived: boolean
          category: string | null
          company_id: string
          created_at: string
          description: string | null
          filename: string | null
          id: string
          mime_type: string | null
          name: string
          owner_id: string
          related_agent_id: string | null
          related_city_id: string | null
          related_region_id: string | null
          related_task_id: string | null
          size_bytes: number | null
          storage_path: string | null
          tags: string[] | null
          updated_at: string
          visibility: Database["public"]["Enums"]["file_visibility"]
          visible_role: Database["public"]["Enums"]["app_role"] | null
        }
        Insert: {
          archived?: boolean
          category?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          filename?: string | null
          id?: string
          mime_type?: string | null
          name: string
          owner_id: string
          related_agent_id?: string | null
          related_city_id?: string | null
          related_region_id?: string | null
          related_task_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          tags?: string[] | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["file_visibility"]
          visible_role?: Database["public"]["Enums"]["app_role"] | null
        }
        Update: {
          archived?: boolean
          category?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          filename?: string | null
          id?: string
          mime_type?: string | null
          name?: string
          owner_id?: string
          related_agent_id?: string | null
          related_city_id?: string | null
          related_region_id?: string | null
          related_task_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          tags?: string[] | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["file_visibility"]
          visible_role?: Database["public"]["Enums"]["app_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "file_asset_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_asset_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_asset_related_agent_id_fkey"
            columns: ["related_agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_asset_related_city_id_fkey"
            columns: ["related_city_id"]
            isOneToOne: false
            referencedRelation: "city"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_asset_related_region_id_fkey"
            columns: ["related_region_id"]
            isOneToOne: false
            referencedRelation: "region"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_asset_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id"]
          },
        ]
      }
      file_share: {
        Row: {
          agent_id: string | null
          area_id: string | null
          city_id: string | null
          created_at: string
          file_id: string
          id: string
          region_id: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          area_id?: string | null
          city_id?: string | null
          created_at?: string
          file_id: string
          id?: string
          region_id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          area_id?: string | null
          city_id?: string | null
          created_at?: string
          file_id?: string
          id?: string
          region_id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_share_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_share_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "area"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_share_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_share_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file_asset"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_share_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "region"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_share_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batch: {
        Row: {
          agent_id: string
          calculation_policy: Json | null
          cancelled_at: string | null
          cancelled_by: string | null
          column_count: number | null
          company_id: string
          completed_at: string | null
          confirmed_by: string | null
          created_at: string
          current_upload_stage: string | null
          detected_date_format: string | null
          error_count: number
          failed_reason: string | null
          file_checksum: string | null
          file_size_bytes: number | null
          id: string
          import_mode: Database["public"]["Enums"]["import_mode"] | null
          imported_at: string | null
          last_successful_row_index: number | null
          mapping_version_id: string | null
          notes: string | null
          period_end: string | null
          period_month: string
          period_start: string | null
          resolved_field_mapping: Json | null
          resolved_value_mapping: Json | null
          row_count: number
          sample_rows: Json | null
          source_filename: string | null
          source_headers: Json | null
          status: Database["public"]["Enums"]["import_status"]
          storage_path: string | null
          total_rows_count: number | null
          upload_progress_percent: number | null
          upload_status: string | null
          uploaded_by: string | null
          uploaded_rows_count: number | null
          warning_count: number
        }
        Insert: {
          agent_id: string
          calculation_policy?: Json | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          column_count?: number | null
          company_id: string
          completed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          current_upload_stage?: string | null
          detected_date_format?: string | null
          error_count?: number
          failed_reason?: string | null
          file_checksum?: string | null
          file_size_bytes?: number | null
          id?: string
          import_mode?: Database["public"]["Enums"]["import_mode"] | null
          imported_at?: string | null
          last_successful_row_index?: number | null
          mapping_version_id?: string | null
          notes?: string | null
          period_end?: string | null
          period_month: string
          period_start?: string | null
          resolved_field_mapping?: Json | null
          resolved_value_mapping?: Json | null
          row_count?: number
          sample_rows?: Json | null
          source_filename?: string | null
          source_headers?: Json | null
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string | null
          total_rows_count?: number | null
          upload_progress_percent?: number | null
          upload_status?: string | null
          uploaded_by?: string | null
          uploaded_rows_count?: number | null
          warning_count?: number
        }
        Update: {
          agent_id?: string
          calculation_policy?: Json | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          column_count?: number | null
          company_id?: string
          completed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          current_upload_stage?: string | null
          detected_date_format?: string | null
          error_count?: number
          failed_reason?: string | null
          file_checksum?: string | null
          file_size_bytes?: number | null
          id?: string
          import_mode?: Database["public"]["Enums"]["import_mode"] | null
          imported_at?: string | null
          last_successful_row_index?: number | null
          mapping_version_id?: string | null
          notes?: string | null
          period_end?: string | null
          period_month?: string
          period_start?: string | null
          resolved_field_mapping?: Json | null
          resolved_value_mapping?: Json | null
          row_count?: number
          sample_rows?: Json | null
          source_filename?: string | null
          source_headers?: Json | null
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string | null
          total_rows_count?: number | null
          upload_progress_percent?: number | null
          upload_status?: string | null
          uploaded_by?: string | null
          uploaded_rows_count?: number | null
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_batch_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batch_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batch_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batch_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batch_mapping_version_id_fkey"
            columns: ["mapping_version_id"]
            isOneToOne: false
            referencedRelation: "column_mapping_version"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batch_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      import_issue: {
        Row: {
          batch_id: string
          code: string
          created_at: string
          field: string | null
          id: number
          message: string
          raw_value: string | null
          row_number: number | null
          severity: Database["public"]["Enums"]["issue_severity"]
        }
        Insert: {
          batch_id: string
          code: string
          created_at?: string
          field?: string | null
          id?: never
          message: string
          raw_value?: string | null
          row_number?: number | null
          severity: Database["public"]["Enums"]["issue_severity"]
        }
        Update: {
          batch_id?: string
          code?: string
          created_at?: string
          field?: string | null
          id?: never
          message?: string
          raw_value?: string | null
          row_number?: number | null
          severity?: Database["public"]["Enums"]["issue_severity"]
        }
        Relationships: [
          {
            foreignKeyName: "import_issue_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batch"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_detail: {
        Row: {
          cover_person_id: string | null
          end_date: string | null
          leave_type: Database["public"]["Enums"]["leave_type"]
          num_days: number | null
          reason: string | null
          request_id: string
          start_date: string | null
        }
        Insert: {
          cover_person_id?: string | null
          end_date?: string | null
          leave_type?: Database["public"]["Enums"]["leave_type"]
          num_days?: number | null
          reason?: string | null
          request_id: string
          start_date?: string | null
        }
        Update: {
          cover_person_id?: string | null
          end_date?: string | null
          leave_type?: Database["public"]["Enums"]["leave_type"]
          num_days?: number | null
          reason?: string | null
          request_id?: string
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_detail_cover_person_id_fkey"
            columns: ["cover_person_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_detail_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "request"
            referencedColumns: ["id"]
          },
        ]
      }
      notification: {
        Row: {
          action_url: string | null
          company_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          read_at: string | null
          related_task_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          action_url?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          read_at?: string | null
          related_task_id?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          action_url?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          read_at?: string | null
          related_task_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      product: {
        Row: {
          barcode: string | null
          brand: string | null
          carton_to_piece_factor: number | null
          company_id: string
          created_at: string
          id: string
          item_category: string | null
          item_name: string | null
          product_family: string | null
          roshen_item_code: string
          uom: string | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          carton_to_piece_factor?: number | null
          company_id: string
          created_at?: string
          id?: string
          item_category?: string | null
          item_name?: string | null
          product_family?: string | null
          roshen_item_code: string
          uom?: string | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          carton_to_piece_factor?: number | null
          company_id?: string
          created_at?: string
          id?: string
          item_category?: string | null
          item_name?: string | null
          product_family?: string | null
          roshen_item_code?: string
          uom?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      profile: {
        Row: {
          company_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profile_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_import_row: {
        Row: {
          batch_id: string
          date_parse_confidence: number | null
          date_parse_error: string | null
          excluded: boolean
          id: number
          is_valid: boolean
          normalized_invoice_date: string | null
          raw: Json
          raw_invoice_date: string | null
          row_number: number
        }
        Insert: {
          batch_id: string
          date_parse_confidence?: number | null
          date_parse_error?: string | null
          excluded?: boolean
          id?: never
          is_valid?: boolean
          normalized_invoice_date?: string | null
          raw: Json
          raw_invoice_date?: string | null
          row_number: number
        }
        Update: {
          batch_id?: string
          date_parse_confidence?: number | null
          date_parse_error?: string | null
          excluded?: boolean
          id?: never
          is_valid?: boolean
          normalized_invoice_date?: string | null
          raw?: Json
          raw_invoice_date?: string | null
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "raw_import_row_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batch"
            referencedColumns: ["id"]
          },
        ]
      }
      region: {
        Row: {
          code: string | null
          company_id: string
          country_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code?: string | null
          company_id: string
          country_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string | null
          company_id?: string
          country_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "region_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "region_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "country"
            referencedColumns: ["id"]
          },
        ]
      }
      request: {
        Row: {
          approval_comment: string | null
          assigned_approver: string | null
          company_id: string
          created_at: string
          currency: string
          decided_at: string | null
          decided_by: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"] | null
          related_agent_id: string | null
          related_business_trip_id: string | null
          related_city_id: string | null
          related_region_id: string | null
          related_task_id: string | null
          request_date: string
          request_type: Database["public"]["Enums"]["request_type"]
          requested_by: string
          status: Database["public"]["Enums"]["request_status"]
          submitted_at: string | null
          title: string
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          approval_comment?: string | null
          assigned_approver?: string | null
          company_id: string
          created_at?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"] | null
          related_agent_id?: string | null
          related_business_trip_id?: string | null
          related_city_id?: string | null
          related_region_id?: string | null
          related_task_id?: string | null
          request_date?: string
          request_type: Database["public"]["Enums"]["request_type"]
          requested_by: string
          status?: Database["public"]["Enums"]["request_status"]
          submitted_at?: string | null
          title: string
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          approval_comment?: string | null
          assigned_approver?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"] | null
          related_agent_id?: string | null
          related_business_trip_id?: string | null
          related_city_id?: string | null
          related_region_id?: string | null
          related_task_id?: string | null
          request_date?: string
          request_type?: Database["public"]["Enums"]["request_type"]
          requested_by?: string
          status?: Database["public"]["Enums"]["request_status"]
          submitted_at?: string | null
          title?: string
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_assigned_approver_fkey"
            columns: ["assigned_approver"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_related_agent_id_fkey"
            columns: ["related_agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_related_business_trip_id_fkey"
            columns: ["related_business_trip_id"]
            isOneToOne: false
            referencedRelation: "request"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_related_city_id_fkey"
            columns: ["related_city_id"]
            isOneToOne: false
            referencedRelation: "city"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_related_region_id_fkey"
            columns: ["related_region_id"]
            isOneToOne: false
            referencedRelation: "region"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      request_activity: {
        Row: {
          actor_id: string | null
          created_at: string
          from_value: string | null
          id: string
          request_id: string
          to_value: string | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_value?: string | null
          id?: string
          request_id: string
          to_value?: string | null
          type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_value?: string | null
          id?: string
          request_id?: string
          to_value?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_activity_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "request"
            referencedColumns: ["id"]
          },
        ]
      }
      request_approval: {
        Row: {
          action: string
          actor_id: string | null
          comment: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["request_status"] | null
          id: string
          request_id: string
          to_status: Database["public"]["Enums"]["request_status"] | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          comment?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["request_status"] | null
          id?: string
          request_id: string
          to_status?: Database["public"]["Enums"]["request_status"] | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          comment?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["request_status"] | null
          id?: string
          request_id?: string
          to_status?: Database["public"]["Enums"]["request_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "request_approval_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_approval_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "request"
            referencedColumns: ["id"]
          },
        ]
      }
      request_attachment: {
        Row: {
          created_at: string
          expense_line_id: string | null
          filename: string
          id: string
          mime_type: string | null
          request_id: string
          size_bytes: number | null
          storage_path: string
          title: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          expense_line_id?: string | null
          filename: string
          id?: string
          mime_type?: string | null
          request_id: string
          size_bytes?: number | null
          storage_path: string
          title?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          expense_line_id?: string | null
          filename?: string
          id?: string
          mime_type?: string | null
          request_id?: string
          size_bytes?: number | null
          storage_path?: string
          title?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_attachment_expense_line_id_fkey"
            columns: ["expense_line_id"]
            isOneToOne: false
            referencedRelation: "expense_line"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_attachment_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "request"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_attachment_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_fact: {
        Row: {
          agent_id: string
          area_id: string | null
          barcode: string | null
          batch_id: string
          branch_id: string | null
          brand: string | null
          calculation_policy_used: Json | null
          carton_to_piece_factor: number | null
          cash_discount: number
          channel_id: string | null
          company_id: string
          country_id: string
          credit_note_number: string | null
          currency: string
          customer_code: string | null
          customer_name: string | null
          doc_discount: number | null
          free_qty: number | null
          free_qty_cartons: number | null
          gross_sales_ex_vat: number | null
          gross_value: number | null
          id: number
          invoice_date: string
          invoice_number: string | null
          invoice_status: Database["public"]["Enums"]["invoice_status"] | null
          is_selling_day: boolean | null
          item_category: string | null
          item_code: string | null
          item_discount: number | null
          item_name: string | null
          line_hash: string | null
          net_sales_ex_vat: number | null
          net_value_reported: number | null
          period_month: string
          product_family: string | null
          promotion_qty: number | null
          region_id: string
          return_qty_cartons: number | null
          return_qty_damage: number | null
          return_qty_expiry: number | null
          return_qty_good: number | null
          return_qty_pieces: number | null
          return_reason: string | null
          return_value_damage: number | null
          return_value_expiry: number | null
          return_value_good: number | null
          returns_value: number
          roshen_item_code: string | null
          route_number: string | null
          sales_qty_cartons: number
          sales_qty_pieces: number
          sales_value_excl_vat: number | null
          salesman_name: string | null
          sla_actual_value: number | null
          source_sales_value: number | null
          txn_type: Database["public"]["Enums"]["txn_type"] | null
          uom: string | null
          vat_amount: number | null
        }
        Insert: {
          agent_id: string
          area_id?: string | null
          barcode?: string | null
          batch_id: string
          branch_id?: string | null
          brand?: string | null
          calculation_policy_used?: Json | null
          carton_to_piece_factor?: number | null
          cash_discount?: number
          channel_id?: string | null
          company_id: string
          country_id: string
          credit_note_number?: string | null
          currency?: string
          customer_code?: string | null
          customer_name?: string | null
          doc_discount?: number | null
          free_qty?: number | null
          free_qty_cartons?: number | null
          gross_sales_ex_vat?: number | null
          gross_value?: number | null
          id?: never
          invoice_date: string
          invoice_number?: string | null
          invoice_status?: Database["public"]["Enums"]["invoice_status"] | null
          is_selling_day?: boolean | null
          item_category?: string | null
          item_code?: string | null
          item_discount?: number | null
          item_name?: string | null
          line_hash?: string | null
          net_sales_ex_vat?: number | null
          net_value_reported?: number | null
          period_month: string
          product_family?: string | null
          promotion_qty?: number | null
          region_id: string
          return_qty_cartons?: number | null
          return_qty_damage?: number | null
          return_qty_expiry?: number | null
          return_qty_good?: number | null
          return_qty_pieces?: number | null
          return_reason?: string | null
          return_value_damage?: number | null
          return_value_expiry?: number | null
          return_value_good?: number | null
          returns_value?: number
          roshen_item_code?: string | null
          route_number?: string | null
          sales_qty_cartons?: number
          sales_qty_pieces?: number
          sales_value_excl_vat?: number | null
          salesman_name?: string | null
          sla_actual_value?: number | null
          source_sales_value?: number | null
          txn_type?: Database["public"]["Enums"]["txn_type"] | null
          uom?: string | null
          vat_amount?: number | null
        }
        Update: {
          agent_id?: string
          area_id?: string | null
          barcode?: string | null
          batch_id?: string
          branch_id?: string | null
          brand?: string | null
          calculation_policy_used?: Json | null
          carton_to_piece_factor?: number | null
          cash_discount?: number
          channel_id?: string | null
          company_id?: string
          country_id?: string
          credit_note_number?: string | null
          currency?: string
          customer_code?: string | null
          customer_name?: string | null
          doc_discount?: number | null
          free_qty?: number | null
          free_qty_cartons?: number | null
          gross_sales_ex_vat?: number | null
          gross_value?: number | null
          id?: never
          invoice_date?: string
          invoice_number?: string | null
          invoice_status?: Database["public"]["Enums"]["invoice_status"] | null
          is_selling_day?: boolean | null
          item_category?: string | null
          item_code?: string | null
          item_discount?: number | null
          item_name?: string | null
          line_hash?: string | null
          net_sales_ex_vat?: number | null
          net_value_reported?: number | null
          period_month?: string
          product_family?: string | null
          promotion_qty?: number | null
          region_id?: string
          return_qty_cartons?: number | null
          return_qty_damage?: number | null
          return_qty_expiry?: number | null
          return_qty_good?: number | null
          return_qty_pieces?: number | null
          return_reason?: string | null
          return_value_damage?: number | null
          return_value_expiry?: number | null
          return_value_good?: number | null
          returns_value?: number
          roshen_item_code?: string | null
          route_number?: string | null
          sales_qty_cartons?: number
          sales_qty_pieces?: number
          sales_value_excl_vat?: number | null
          salesman_name?: string | null
          sla_actual_value?: number | null
          source_sales_value?: number | null
          txn_type?: Database["public"]["Enums"]["txn_type"] | null
          uom?: string | null
          vat_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_fact_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fact_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "area"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fact_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fact_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fact_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fact_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fact_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "country"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fact_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "region"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_target: {
        Row: {
          agent_id: string | null
          area_id: string | null
          branch_id: string | null
          channel_id: string | null
          company_id: string
          country_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          level: Database["public"]["Enums"]["org_level"]
          period_month: string
          region_id: string | null
          target_amount: number
          target_qty: number | null
          updated_at: string
          working_days: number | null
        }
        Insert: {
          agent_id?: string | null
          area_id?: string | null
          branch_id?: string | null
          channel_id?: string | null
          company_id: string
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          level: Database["public"]["Enums"]["org_level"]
          period_month: string
          region_id?: string | null
          target_amount?: number
          target_qty?: number | null
          updated_at?: string
          working_days?: number | null
        }
        Update: {
          agent_id?: string | null
          area_id?: string | null
          branch_id?: string | null
          channel_id?: string | null
          company_id?: string
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          level?: Database["public"]["Enums"]["org_level"]
          period_month?: string
          region_id?: string | null
          target_amount?: number
          target_qty?: number | null
          updated_at?: string
          working_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_target_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_target_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "area"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_target_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_target_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_target_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_target_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "country"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_target_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_target_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "region"
            referencedColumns: ["id"]
          },
        ]
      }
      task: {
        Row: {
          assigned_to: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          due_time: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          related_agent_id: string | null
          related_area_id: string | null
          related_branch_id: string | null
          related_city_id: string | null
          related_import_batch_id: string | null
          related_sla_target_id: string | null
          reminder_at: string | null
          reminder_offset: Database["public"]["Enums"]["reminder_offset"]
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          timezone: string
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["task_visibility_kind"]
          visible_role: Database["public"]["Enums"]["app_role"] | null
        }
        Insert: {
          assigned_to?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          related_agent_id?: string | null
          related_area_id?: string | null
          related_branch_id?: string | null
          related_city_id?: string | null
          related_import_batch_id?: string | null
          related_sla_target_id?: string | null
          reminder_at?: string | null
          reminder_offset?: Database["public"]["Enums"]["reminder_offset"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          timezone?: string
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["task_visibility_kind"]
          visible_role?: Database["public"]["Enums"]["app_role"] | null
        }
        Update: {
          assigned_to?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          related_agent_id?: string | null
          related_area_id?: string | null
          related_branch_id?: string | null
          related_city_id?: string | null
          related_import_batch_id?: string | null
          related_sla_target_id?: string | null
          reminder_at?: string | null
          reminder_offset?: Database["public"]["Enums"]["reminder_offset"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          timezone?: string
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["task_visibility_kind"]
          visible_role?: Database["public"]["Enums"]["app_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "task_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_related_agent_id_fkey"
            columns: ["related_agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_related_area_id_fkey"
            columns: ["related_area_id"]
            isOneToOne: false
            referencedRelation: "area"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_related_branch_id_fkey"
            columns: ["related_branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_related_city_id_fkey"
            columns: ["related_city_id"]
            isOneToOne: false
            referencedRelation: "city"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_related_import_batch_id_fkey"
            columns: ["related_import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_related_sla_target_id_fkey"
            columns: ["related_sla_target_id"]
            isOneToOne: false
            referencedRelation: "sla_performance"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "task_related_sla_target_id_fkey"
            columns: ["related_sla_target_id"]
            isOneToOne: false
            referencedRelation: "sla_target"
            referencedColumns: ["id"]
          },
        ]
      }
      task_activity: {
        Row: {
          actor_id: string | null
          created_at: string
          from_value: string | null
          id: string
          task_id: string
          to_value: string | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_value?: string | null
          id?: string
          task_id: string
          to_value?: string | null
          type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_value?: string | null
          id?: string
          task_id?: string
          to_value?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignee: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          completed_at: string | null
          id: string
          status: Database["public"]["Enums"]["task_status"]
          task_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          completed_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["task_status"]
          task_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          completed_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["task_status"]
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignee_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignee_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignee_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachment: {
        Row: {
          created_at: string
          filename: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          task_id: string
          title: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          task_id: string
          title?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          task_id?: string
          title?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachment_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachment_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comment: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comment_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comment_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id"]
          },
        ]
      }
      task_reminder: {
        Row: {
          created_at: string
          id: string
          remind_at: string
          reminder_kind: Database["public"]["Enums"]["reminder_offset"] | null
          sent_at: string | null
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          remind_at: string
          reminder_kind?: Database["public"]["Enums"]["reminder_offset"] | null
          sent_at?: string | null
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          remind_at?: string
          reminder_kind?: Database["public"]["Enums"]["reminder_offset"] | null
          sent_at?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_reminder_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id"]
          },
        ]
      }
      task_visibility: {
        Row: {
          agent_id: string | null
          area_id: string | null
          branch_id: string | null
          city_id: string | null
          created_at: string
          id: string
          region_id: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          task_id: string
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          area_id?: string | null
          branch_id?: string | null
          city_id?: string | null
          created_at?: string
          id?: string
          region_id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          task_id: string
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          area_id?: string | null
          branch_id?: string | null
          city_id?: string | null
          created_at?: string
          id?: string
          region_id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_visibility_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_visibility_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "area"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_visibility_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_visibility_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_visibility_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "region"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_visibility_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_visibility_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      user_scope: {
        Row: {
          agent_id: string | null
          area_id: string | null
          branch_id: string | null
          city_id: string | null
          company_id: string
          created_at: string
          id: string
          level: Database["public"]["Enums"]["org_level"]
          region_id: string | null
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          area_id?: string | null
          branch_id?: string | null
          city_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          level: Database["public"]["Enums"]["org_level"]
          region_id?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string | null
          area_id?: string | null
          branch_id?: string | null
          city_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["org_level"]
          region_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_scope_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scope_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "area"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scope_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scope_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scope_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scope_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "region"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scope_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      value_mapping: {
        Row: {
          agent_id: string | null
          canonical_text: string | null
          channel_id: string | null
          city_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          dimension: Database["public"]["Enums"]["value_dimension"]
          id: string
          is_active: boolean
          source_value: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          canonical_text?: string | null
          channel_id?: string | null
          city_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          dimension: Database["public"]["Enums"]["value_dimension"]
          id?: string
          is_active?: boolean
          source_value: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          canonical_text?: string | null
          channel_id?: string | null
          city_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          dimension?: Database["public"]["Enums"]["value_dimension"]
          id?: string
          is_active?: boolean
          source_value?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "value_mapping_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "value_mapping_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "value_mapping_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "value_mapping_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "value_mapping_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      import_batch_totals: {
        Row: {
          batch_id: string | null
          fact_rows: number | null
          sla_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_fact_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batch"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_actual_agent_month: {
        Row: {
          actual_amount: number | null
          actual_qty_cartons: number | null
          actual_qty_pieces: number | null
          agent_id: string | null
          area_id: string | null
          branch_id: string | null
          cash_discount: number | null
          channel_id: string | null
          company_id: string | null
          country_id: string | null
          gross_sales_ex_vat: number | null
          last_invoice_date: string | null
          net_sales_ex_vat: number | null
          period_month: string | null
          region_id: string | null
          returns_value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_fact_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fact_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "area"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fact_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fact_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fact_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fact_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "country"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fact_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "region"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_actual_agent_ytd: {
        Row: {
          agent_id: string | null
          channel_id: string | null
          company_id: string | null
          year_start: string | null
          ytd_actual_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_fact_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fact_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fact_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_coverage: {
        Row: {
          active_customers: number | null
          channel_id: string | null
          ent_id: string | null
          lvl: Database["public"]["Enums"]["org_level"] | null
          period_month: string | null
          uploaded_customers: number | null
        }
        Relationships: []
      }
      sla_performance: {
        Row: {
          achievement_pct: number | null
          actual_amount: number | null
          channel_id: string | null
          company_id: string | null
          days_in_month: number | null
          elapsed_days: number | null
          ent_id: string | null
          gap_amount: number | null
          level: Database["public"]["Enums"]["org_level"] | null
          pace_pct: number | null
          period_month: string | null
          required_run_rate: number | null
          status: string | null
          target_amount: number | null
          target_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_target_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_target_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_scorecard: {
        Row: {
          active_customers: number | null
          actual_coverage_pct: number | null
          actual_sales: number | null
          actual_salesmen: number | null
          cashvan_available: boolean | null
          cashvan_required: boolean | null
          channel_id: string | null
          company_id: string | null
          ent_id: string | null
          level: Database["public"]["Enums"]["org_level"] | null
          period_month: string | null
          required_active_customers: number | null
          required_coverage_pct: number | null
          required_customer_universe: number | null
          required_salesmen: number | null
          sales_ach_pct: number | null
          sales_gap: number | null
          sales_status: string | null
          sales_target: number | null
          salesmen_gap: number | null
          sc_active: number | null
          sc_cov: number | null
          sc_force: number | null
          sc_sales: number | null
          sc_service: number | null
          sla_score: number | null
          sla_status: string | null
          supervisor_available: boolean | null
          supervisor_required: boolean | null
          uploaded_customers: number | null
          warehouse_available: boolean | null
          warehouse_required: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_target_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_target_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      can_see_file: {
        Args: {
          p_id: string
          p_owner: string
          p_visibility: Database["public"]["Enums"]["file_visibility"]
          p_visible_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      can_see_request: {
        Args: {
          p_approver: string
          p_related_agent: string
          p_related_city: string
          p_related_region: string
          p_requested_by: string
        }
        Returns: boolean
      }
      can_see_task: {
        Args: {
          p_assigned_to: string
          p_created_by: string
          p_id: string
          p_related_area_id: string
          p_related_city_id: string
          p_visibility: Database["public"]["Enums"]["task_visibility_kind"]
          p_visible_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      enqueue_notification: {
        Args: {
          p_action_url?: string
          p_message?: string
          p_task_id?: string
          p_title: string
          p_type: Database["public"]["Enums"]["notification_type"]
          p_user_id: string
        }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_global: { Args: never; Returns: boolean }
      my_agent_ids: { Args: never; Returns: string[] }
      my_area_ids: { Args: never; Returns: string[] }
      my_region_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      agent_type: "agent" | "distributor"
      app_role:
        | "company_manager"
        | "area_manager"
        | "branch_manager"
        | "sales_supervisor"
        | "salesman"
        | "finance"
        | "admin"
      discount_handling:
        | "discount_already_deducted"
        | "subtract_cash_discount"
        | "ignore_discount_for_sla"
        | "store_only"
      expense_category:
        | "fuel"
        | "parking"
        | "taxi"
        | "hotel"
        | "meals"
        | "customer_meeting"
        | "office_admin"
        | "business_trip"
        | "other"
      file_visibility:
        | "private"
        | "selected_users"
        | "selected_role"
        | "selected_scope"
        | "public_company"
      import_mode:
        | "full_period_replace"
        | "incremental_append"
        | "replace_overlapping"
        | "correction_reprocess"
      import_status:
        | "pending"
        | "mapped"
        | "previewed"
        | "validated"
        | "imported"
        | "superseded"
        | "cancelled"
        | "failed"
      invoice_status: "posted" | "cancelled" | "draft"
      issue_severity: "error" | "warning" | "info"
      leave_type: "annual" | "sick" | "unpaid" | "emergency" | "other"
      mapping_status: "draft" | "active" | "archived"
      notification_type:
        | "task_assigned"
        | "task_due_soon"
        | "task_overdue"
        | "status_changed"
        | "comment_added"
        | "task_reassigned"
        | "task_completed"
        | "task_cancelled"
        | "mentioned"
        | "scope_task_created"
        | "file_attached"
        | "file_shared"
        | "request_submitted"
        | "approval_required"
        | "request_approved"
        | "request_rejected"
        | "request_returned"
        | "request_paid"
        | "missing_receipt"
      org_level:
        | "company"
        | "country"
        | "region"
        | "area"
        | "branch"
        | "agent"
        | "city"
      reminder_offset: "none" | "at_due" | "1h_before" | "1d_before" | "custom"
      request_status:
        | "draft"
        | "submitted"
        | "pending_approval"
        | "approved"
        | "rejected"
        | "cancelled"
        | "paid"
        | "closed"
      request_type: "business_trip" | "expense" | "leave"
      returns_handling:
        | "returns_already_deducted"
        | "subtract_returns_value"
        | "store_returns_only"
      sales_value_basis:
        | "gross_before_discount"
        | "net_after_discount"
        | "excluding_vat_before_discount"
        | "excluding_vat_after_discount"
        | "net_after_returns_excluding_vat"
      sla_actual_basis:
        | "sales_value_excluding_vat"
        | "net_sales_excluding_vat"
        | "gross_sales_excluding_vat"
        | "custom_formula_later"
      task_priority: "low" | "normal" | "high" | "urgent"
      task_status:
        | "not_started"
        | "in_progress"
        | "blocked"
        | "completed"
        | "cancelled"
        | "waiting"
      task_visibility_kind:
        | "private_assignee"
        | "creator_assignee"
        | "selected_users"
        | "selected_role"
        | "selected_scope"
        | "all_managers"
      transportation_type: "flight" | "car" | "bus" | "train" | "other"
      travel_type: "domestic" | "international"
      txn_type: "sale" | "return" | "credit_note" | "debit_note"
      value_dimension:
        | "channel"
        | "city"
        | "return_reason"
        | "salesman"
        | "customer"
        | "item"
      vat_handling: "value_excludes_vat" | "value_includes_vat"
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
      agent_type: ["agent", "distributor"],
      app_role: [
        "company_manager",
        "area_manager",
        "branch_manager",
        "sales_supervisor",
        "salesman",
        "finance",
        "admin",
      ],
      discount_handling: [
        "discount_already_deducted",
        "subtract_cash_discount",
        "ignore_discount_for_sla",
        "store_only",
      ],
      expense_category: [
        "fuel",
        "parking",
        "taxi",
        "hotel",
        "meals",
        "customer_meeting",
        "office_admin",
        "business_trip",
        "other",
      ],
      file_visibility: [
        "private",
        "selected_users",
        "selected_role",
        "selected_scope",
        "public_company",
      ],
      import_mode: [
        "full_period_replace",
        "incremental_append",
        "replace_overlapping",
        "correction_reprocess",
      ],
      import_status: [
        "pending",
        "mapped",
        "previewed",
        "validated",
        "imported",
        "superseded",
        "cancelled",
        "failed",
      ],
      invoice_status: ["posted", "cancelled", "draft"],
      issue_severity: ["error", "warning", "info"],
      leave_type: ["annual", "sick", "unpaid", "emergency", "other"],
      mapping_status: ["draft", "active", "archived"],
      notification_type: [
        "task_assigned",
        "task_due_soon",
        "task_overdue",
        "status_changed",
        "comment_added",
        "task_reassigned",
        "task_completed",
        "task_cancelled",
        "mentioned",
        "scope_task_created",
        "file_attached",
        "file_shared",
        "request_submitted",
        "approval_required",
        "request_approved",
        "request_rejected",
        "request_returned",
        "request_paid",
        "missing_receipt",
      ],
      org_level: [
        "company",
        "country",
        "region",
        "area",
        "branch",
        "agent",
        "city",
      ],
      reminder_offset: ["none", "at_due", "1h_before", "1d_before", "custom"],
      request_status: [
        "draft",
        "submitted",
        "pending_approval",
        "approved",
        "rejected",
        "cancelled",
        "paid",
        "closed",
      ],
      request_type: ["business_trip", "expense", "leave"],
      returns_handling: [
        "returns_already_deducted",
        "subtract_returns_value",
        "store_returns_only",
      ],
      sales_value_basis: [
        "gross_before_discount",
        "net_after_discount",
        "excluding_vat_before_discount",
        "excluding_vat_after_discount",
        "net_after_returns_excluding_vat",
      ],
      sla_actual_basis: [
        "sales_value_excluding_vat",
        "net_sales_excluding_vat",
        "gross_sales_excluding_vat",
        "custom_formula_later",
      ],
      task_priority: ["low", "normal", "high", "urgent"],
      task_status: [
        "not_started",
        "in_progress",
        "blocked",
        "completed",
        "cancelled",
        "waiting",
      ],
      task_visibility_kind: [
        "private_assignee",
        "creator_assignee",
        "selected_users",
        "selected_role",
        "selected_scope",
        "all_managers",
      ],
      transportation_type: ["flight", "car", "bus", "train", "other"],
      travel_type: ["domestic", "international"],
      txn_type: ["sale", "return", "credit_note", "debit_note"],
      value_dimension: [
        "channel",
        "city",
        "return_reason",
        "salesman",
        "customer",
        "item",
      ],
      vat_handling: ["value_excludes_vat", "value_includes_vat"],
    },
  },
} as const
