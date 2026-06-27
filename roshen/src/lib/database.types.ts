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
      import_batch: {
        Row: {
          agent_id: string
          calculation_policy: Json | null
          column_count: number | null
          company_id: string
          confirmed_by: string | null
          created_at: string
          detected_date_format: string | null
          error_count: number
          file_checksum: string | null
          file_size_bytes: number | null
          id: string
          import_mode: Database["public"]["Enums"]["import_mode"] | null
          imported_at: string | null
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
          uploaded_by: string | null
          warning_count: number
        }
        Insert: {
          agent_id: string
          calculation_policy?: Json | null
          column_count?: number | null
          company_id: string
          confirmed_by?: string | null
          created_at?: string
          detected_date_format?: string | null
          error_count?: number
          file_checksum?: string | null
          file_size_bytes?: number | null
          id?: string
          import_mode?: Database["public"]["Enums"]["import_mode"] | null
          imported_at?: string | null
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
          uploaded_by?: string | null
          warning_count?: number
        }
        Update: {
          agent_id?: string
          calculation_policy?: Json | null
          column_count?: number | null
          company_id?: string
          confirmed_by?: string | null
          created_at?: string
          detected_date_format?: string | null
          error_count?: number
          file_checksum?: string | null
          file_size_bytes?: number | null
          id?: string
          import_mode?: Database["public"]["Enums"]["import_mode"] | null
          imported_at?: string | null
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
          uploaded_by?: string | null
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
    }
    Functions: {
      app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
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
      mapping_status: "draft" | "active" | "archived"
      org_level:
        | "company"
        | "country"
        | "region"
        | "area"
        | "branch"
        | "agent"
        | "city"
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
      mapping_status: ["draft", "active", "archived"],
      org_level: [
        "company",
        "country",
        "region",
        "area",
        "branch",
        "agent",
        "city",
      ],
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
