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
      notifications: {
        Row: { id: number; user_id: string; type: string; severity: string; title: string; body: string | null; entity_type: string | null; entity_id: string | null; action_url: string | null; read_at: string | null; dismissed_at: string | null; silent: boolean; created_at: string }
        Insert: { id?: never; user_id: string; type: string; severity?: string; title: string; body?: string | null; entity_type?: string | null; entity_id?: string | null; action_url?: string | null; read_at?: string | null; dismissed_at?: string | null; silent?: boolean; created_at?: string }
        Update: { user_id?: string; type?: string; severity?: string; title?: string; body?: string | null; entity_type?: string | null; entity_id?: string | null; action_url?: string | null; read_at?: string | null; dismissed_at?: string | null; silent?: boolean }
        Relationships: []
      }
      open_files: {
        Row: { id: number; operation_id: number; file_type: string; opened_at: string; due_at: string; closed_at: string | null; closed_by: string | null; close_reason: string | null; assigned_to: string | null; snooze_until: string | null; snooze_count: number; last_notified_at: string | null; last_level: number; created_at: string; updated_at: string }
        Insert: { id?: never; operation_id: number; file_type: string; opened_at?: string; due_at: string; closed_at?: string | null; closed_by?: string | null; close_reason?: string | null; assigned_to?: string | null; snooze_until?: string | null; snooze_count?: number; last_notified_at?: string | null; last_level?: number; created_at?: string; updated_at?: string }
        Update: { closed_at?: string | null; assigned_to?: string | null; snooze_until?: string | null; snooze_count?: number; last_notified_at?: string | null; last_level?: number }
        Relationships: []
      }
      open_file_snoozes: {
        Row: { id: number; open_file_id: number; reason: string; snoozed_until: string; snoozed_by: string | null; created_at: string }
        Insert: { id?: never; open_file_id: number; reason: string; snoozed_until: string; snoozed_by?: string | null; created_at?: string }
        Update: { reason?: string; snoozed_until?: string }
        Relationships: []
      }
      notification_rules: {
        Row: { id: number; file_type: string; level: number; scope: string; recipient_type: string; recipient_ref: string | null; is_active: boolean; created_at: string; updated_at: string }
        Insert: { id?: never; file_type: string; level: number; scope?: string; recipient_type: string; recipient_ref?: string | null; is_active?: boolean; created_at?: string; updated_at?: string }
        Update: { file_type?: string; level?: number; scope?: string; recipient_type?: string; recipient_ref?: string | null; is_active?: boolean }
        Relationships: []
      }
      catalogs: {
        Row: { id: number; name: string; season: string | null; year: number | null; currency: string; is_active: boolean; published_at: string | null; cover_file_id: number | null; description: string | null; created_by: string | null; created_at: string; updated_at: string; deleted_at: string | null; deleted_by: string | null }
        Insert: { id?: never; name: string; season?: string | null; year?: number | null; currency?: string; is_active?: boolean; published_at?: string | null; cover_file_id?: number | null; description?: string | null; created_by?: string | null }
        Update: { name?: string; season?: string | null; year?: number | null; currency?: string; is_active?: boolean; description?: string | null; deleted_at?: string | null; deleted_by?: string | null }
        Relationships: []
      }
      catalog_collections: {
        Row: { id: number; catalog_id: number; name: string; code: string | null; sort_order: number; is_active: boolean; created_at: string; updated_at: string }
        Insert: { id?: never; catalog_id: number; name: string; code?: string | null; sort_order?: number; is_active?: boolean }
        Update: { name?: string; code?: string | null; sort_order?: number; is_active?: boolean }
        Relationships: []
      }
      catalog_products: {
        Row: { id: number; catalog_id: number; collection_id: number | null; code: string; name: string; name_normalized: string; category_id: number | null; type_id: number | null; composition: string | null; description: string | null; moq: number; size_system: string | null; sizes: string[]; colors: Json; custom_margin_percent: number | null; sort_order: number; is_active: boolean; deleted_at: string | null; deleted_by: string | null; created_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: never; catalog_id: number; collection_id?: number | null; code: string; name: string; category_id?: number | null; type_id?: number | null; composition?: string | null; description?: string | null; moq?: number; size_system?: string | null; sizes?: string[]; colors?: Json; custom_margin_percent?: number | null; sort_order?: number; is_active?: boolean; created_by?: string | null }
        Update: { collection_id?: number | null; code?: string; name?: string; category_id?: number | null; type_id?: number | null; composition?: string | null; description?: string | null; moq?: number; size_system?: string | null; sizes?: string[]; colors?: Json; custom_margin_percent?: number | null; sort_order?: number; is_active?: boolean; deleted_at?: string | null; deleted_by?: string | null }
        Relationships: []
      }
      catalog_product_images: {
        Row: { id: number; product_id: number; file_id: number; image_type: string; sort_order: number; created_at: string }
        Insert: { id?: never; product_id: number; file_id: number; image_type?: string; sort_order?: number }
        Update: { image_type?: string; sort_order?: number }
        Relationships: []
      }
      exchange_rates: {
        Row: { id: number; currency: string; rate_try: number; source: string; fetched_at: string; is_current: boolean }
        Insert: { id?: never; currency: string; rate_try: number; source?: string; is_current?: boolean }
        Update: { is_current?: boolean }
        Relationships: []
      }
      margin_tiers: {
        Row: { id: number; min_quantity: number; margin_percent: number; is_active: boolean; sort_order: number; created_at: string; updated_at: string }
        Insert: { id?: never; min_quantity: number; margin_percent: number; is_active?: boolean; sort_order?: number }
        Update: { min_quantity?: number; margin_percent?: number; is_active?: boolean; sort_order?: number }
        Relationships: []
      }
      product_costs: {
        Row: { id: number; product_id: number; version: number; is_current: boolean; currency_display: string; total_cost_try: number; total_cost_usd: number; rate_snapshot: Json; notes: string | null; created_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: never; product_id: number; version?: number; is_current?: boolean; total_cost_try?: number; total_cost_usd?: number; rate_snapshot?: Json; notes?: string | null; created_by?: string | null }
        Update: { is_current?: boolean; notes?: string | null }
        Relationships: []
      }
      product_cost_items: {
        Row: { id: number; cost_id: number; item_type: string; name: string; calculation_type: string; quantity: number | null; unit_price: number | null; amount: number | null; currency: string; fabric_name: string | null; sort_order: number }
        Insert: { id?: never; cost_id: number; item_type?: string; name: string; calculation_type?: string; quantity?: number | null; unit_price?: number | null; amount?: number | null; currency?: string; fabric_name?: string | null; sort_order?: number }
        Update: { name?: string; item_type?: string; calculation_type?: string; quantity?: number | null; unit_price?: number | null; amount?: number | null; currency?: string; fabric_name?: string | null; sort_order?: number }
        Relationships: []
      }
      account_transactions: {
        Row: { id: number; customer_id: number; direction: string; source_type: string; source_id: number | null; operation_id: number | null; amount: number; currency: string; exchange_rate: number; usd_rate: number; amount_try: number; amount_usd: number; occurred_at: string; description: string | null; reverses_id: number | null; deleted_at: string | null; deleted_by: string | null; created_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: never; customer_id: number; direction: string; source_type: string; source_id?: number | null; operation_id?: number | null; amount: number; currency: string; exchange_rate: number; usd_rate: number; amount_try: number; amount_usd: number; occurred_at?: string; description?: string | null; reverses_id?: number | null; created_by?: string | null }
        Update: { description?: string | null; deleted_at?: string | null; deleted_by?: string | null }
        Relationships: []
      }
      payment_methods: {
        Row: { id: number; key: string; label: string; sort_order: number; is_active: boolean; is_system: boolean; created_at: string; updated_at: string }
        Insert: { id?: never; key: string; label: string; sort_order?: number; is_active?: boolean; is_system?: boolean }
        Update: { key?: string; label?: string; sort_order?: number; is_active?: boolean }
        Relationships: []
      }
      bank_accounts: {
        Row: { id: number; bank_name: string; account_name: string | null; iban: string | null; currency: string; is_active: boolean; sort_order: number; created_at: string; updated_at: string }
        Insert: { id?: never; bank_name: string; account_name?: string | null; iban?: string | null; currency?: string; is_active?: boolean; sort_order?: number }
        Update: { bank_name?: string; account_name?: string | null; iban?: string | null; currency?: string; is_active?: boolean; sort_order?: number }
        Relationships: []
      }
      teams: {
        Row: { id: number; name: string; code: string | null; department_id: number | null; lead_user_id: string | null; is_active: boolean; created_at: string; updated_at: string }
        Insert: { id?: never; name: string; code?: string | null; department_id?: number | null; lead_user_id?: string | null; is_active?: boolean }
        Update: { name?: string; code?: string | null; department_id?: number | null; lead_user_id?: string | null; is_active?: boolean }
        Relationships: []
      }
      team_members: {
        Row: { id: number; team_id: number; user_id: string; joined_at: string }
        Insert: { id?: never; team_id: number; user_id: string; joined_at?: string }
        Update: { team_id?: number; user_id?: string }
        Relationships: []
      }
      task_statuses: {
        Row: { id: number; key: string; label: string; sort_order: number; color: string | null; is_default: boolean; is_closed: boolean; is_active: boolean; is_system: boolean; created_at: string; updated_at: string }
        Insert: { id?: never; key: string; label: string; sort_order?: number; color?: string | null; is_default?: boolean; is_closed?: boolean; is_active?: boolean; is_system?: boolean }
        Update: { key?: string; label?: string; sort_order?: number; color?: string | null; is_default?: boolean; is_closed?: boolean; is_active?: boolean }
        Relationships: []
      }
      task_priorities: {
        Row: { id: number; key: string; label: string; sort_order: number; color: string | null; weight: number; is_default: boolean; is_active: boolean; is_system: boolean; created_at: string; updated_at: string }
        Insert: { id?: never; key: string; label: string; sort_order?: number; color?: string | null; weight?: number; is_default?: boolean; is_active?: boolean; is_system?: boolean }
        Update: { key?: string; label?: string; sort_order?: number; color?: string | null; weight?: number; is_default?: boolean; is_active?: boolean }
        Relationships: []
      }
      tasks: {
        Row: { id: number; title: string; description: string | null; status_id: number | null; priority_id: number | null; assigned_to: string | null; assigned_team_id: number | null; created_by: string | null; parent_task_id: number | null; entity_type: string | null; entity_id: number | null; started_at: string | null; due_at: string | null; completed_at: string | null; estimated_hours: number | null; source: string; sort_order: number; deleted_at: string | null; deleted_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: never; title: string; description?: string | null; status_id?: number | null; priority_id?: number | null; assigned_to?: string | null; assigned_team_id?: number | null; created_by?: string | null; parent_task_id?: number | null; entity_type?: string | null; entity_id?: number | null; started_at?: string | null; due_at?: string | null; completed_at?: string | null; estimated_hours?: number | null; source?: string; sort_order?: number }
        Update: { title?: string; description?: string | null; status_id?: number | null; priority_id?: number | null; assigned_to?: string | null; assigned_team_id?: number | null; parent_task_id?: number | null; entity_type?: string | null; entity_id?: number | null; started_at?: string | null; due_at?: string | null; completed_at?: string | null; estimated_hours?: number | null; source?: string; sort_order?: number; deleted_at?: string | null; deleted_by?: string | null }
        Relationships: []
      }
      task_dependencies: {
        Row: { id: number; task_id: number; depends_on_task_id: number; dependency_type: string; created_at: string }
        Insert: { id?: never; task_id: number; depends_on_task_id: number; dependency_type?: string }
        Update: { dependency_type?: string }
        Relationships: []
      }
      task_assignments: {
        Row: { id: number; task_id: number; assigned_to: string | null; assigned_by: string | null; assigned_at: string; unassigned_at: string | null; reason: string | null }
        Insert: { id?: never; task_id: number; assigned_to?: string | null; assigned_by?: string | null; assigned_at?: string; unassigned_at?: string | null; reason?: string | null }
        Update: { unassigned_at?: string | null; reason?: string | null }
        Relationships: []
      }
      goals: {
        Row: { id: number; name: string; goal_type: string; scope: string; scope_user_id: string | null; scope_department_id: number | null; scope_team_id: number | null; period_type: string; period_start: string; period_end: string; target_value: number; currency: string | null; is_active: boolean; created_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: never; name: string; goal_type: string; scope: string; scope_user_id?: string | null; scope_department_id?: number | null; scope_team_id?: number | null; period_type: string; period_start: string; period_end: string; target_value: number; currency?: string | null; is_active?: boolean; created_by?: string | null }
        Update: { name?: string; goal_type?: string; scope?: string; scope_user_id?: string | null; scope_department_id?: number | null; scope_team_id?: number | null; period_type?: string; period_start?: string; period_end?: string; target_value?: number; currency?: string | null; is_active?: boolean }
        Relationships: []
      }
      ai_requests: {
        Row: { id: number; user_id: string | null; feature: string; input_summary: Json; payload_hash: string | null; model: string | null; tokens_in: number | null; tokens_out: number | null; response_summary: string | null; status: string; accepted: boolean | null; rejected_reason: string | null; corrected_fields: string[] | null; duration_ms: number | null; created_at: string }
        Insert: { id?: never; user_id?: string | null; feature: string; input_summary?: Json; payload_hash?: string | null; model?: string | null; tokens_in?: number | null; tokens_out?: number | null; response_summary?: string | null; status?: string; accepted?: boolean | null; rejected_reason?: string | null; corrected_fields?: string[] | null; duration_ms?: number | null }
        Update: { accepted?: boolean | null; rejected_reason?: string | null; corrected_fields?: string[] | null }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_email: string | null
          actor_id: string | null
          changed_fields: string[] | null
          created_at: string
          id: number
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          source: Database["public"]["Enums"]["audit_source"]
          table_name: string
          user_agent: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_email?: string | null
          actor_id?: string | null
          changed_fields?: string[] | null
          created_at?: string
          id?: never
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          source?: Database["public"]["Enums"]["audit_source"]
          table_name: string
          user_agent?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_email?: string | null
          actor_id?: string | null
          changed_fields?: string[] | null
          created_at?: string
          id?: never
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          source?: Database["public"]["Enums"]["audit_source"]
          table_name?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      cancellation_reasons: {
        Row: {
          color: string | null
          created_at: string
          id: number
          is_active: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      code_registry: {
        Row: {
          code: string
          created_at: string
          entity_id: string | null
          entity_type: string
        }
        Insert: {
          code: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
        }
        Update: {
          code?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
        }
        Relationships: []
      }
      contact_points: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: number
          entity_type: string
          id: number
          is_primary: boolean
          label: string | null
          type: string
          updated_at: string
          value: string
          value_normalized: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: number
          entity_type: string
          id?: never
          is_primary?: boolean
          label?: string | null
          type: string
          updated_at?: string
          value: string
          value_normalized?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: number
          entity_type?: string
          id?: never
          is_primary?: boolean
          label?: string | null
          type?: string
          updated_at?: string
          value?: string
          value_normalized?: string | null
        }
        Relationships: []
      }
      customer_statuses: {
        Row: {
          color: string | null
          created_at: string
          id: number
          is_active: boolean
          is_default: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_default?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_default?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      customer_types: {
        Row: {
          color: string | null
          created_at: string
          id: number
          is_active: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          account_holder: string | null
          address: string | null
          assigned_to: string | null
          bank_name: string | null
          city: string | null
          city_normalized: string | null
          company_name: string | null
          company_name_normalized: string | null
          converted_at: string | null
          converted_by: string | null
          converted_from_lead_id: number | null
          country: string | null
          created_at: string
          created_by: string | null
          customer_code: string | null
          customer_type_id: number | null
          deleted_at: string | null
          deleted_by: string | null
          district: string | null
          external_id: string | null
          external_source: string | null
          first_contact_channel_id: number | null
          first_contact_date: string | null
          full_name: string | null
          full_name_normalized: string | null
          iban: string | null
          iban_normalized: string | null
          id: number
          import_batch_id: number | null
          last_interaction_at: string | null
          next_action_at: string | null
          source_id: number | null
          status_id: number
          tax_number: string | null
          tax_number_normalized: string | null
          tax_office: string | null
          updated_at: string
        }
        Insert: {
          account_holder?: string | null
          address?: string | null
          assigned_to?: string | null
          bank_name?: string | null
          city?: string | null
          city_normalized?: string | null
          company_name?: string | null
          company_name_normalized?: string | null
          converted_at?: string | null
          converted_by?: string | null
          converted_from_lead_id?: number | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          customer_code?: string | null
          customer_type_id?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          district?: string | null
          external_id?: string | null
          external_source?: string | null
          first_contact_channel_id?: number | null
          first_contact_date?: string | null
          full_name?: string | null
          full_name_normalized?: string | null
          iban?: string | null
          iban_normalized?: string | null
          id?: never
          import_batch_id?: number | null
          last_interaction_at?: string | null
          next_action_at?: string | null
          source_id?: number | null
          status_id: number
          tax_number?: string | null
          tax_number_normalized?: string | null
          tax_office?: string | null
          updated_at?: string
        }
        Update: {
          account_holder?: string | null
          address?: string | null
          assigned_to?: string | null
          bank_name?: string | null
          city?: string | null
          city_normalized?: string | null
          company_name?: string | null
          company_name_normalized?: string | null
          converted_at?: string | null
          converted_by?: string | null
          converted_from_lead_id?: number | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          customer_code?: string | null
          customer_type_id?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          district?: string | null
          external_id?: string | null
          external_source?: string | null
          first_contact_channel_id?: number | null
          first_contact_date?: string | null
          full_name?: string | null
          full_name_normalized?: string | null
          iban?: string | null
          iban_normalized?: string | null
          id?: never
          import_batch_id?: number | null
          last_interaction_at?: string | null
          next_action_at?: string | null
          source_id?: number | null
          status_id?: number
          tax_number?: string | null
          tax_number_normalized?: string | null
          tax_office?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_converted_by_fkey"
            columns: ["converted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_converted_from_lead_id_fkey"
            columns: ["converted_from_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_customer_type_id_fkey"
            columns: ["customer_type_id"]
            isOneToOne: false
            referencedRelation: "customer_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "customer_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: number
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: never
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: never
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      document_types: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          key: string
          label_en: string
          label_tr: string
          orientation: string
          page_size: string
          sort_order: number
          template_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_active?: boolean
          key: string
          label_en: string
          label_tr: string
          orientation?: string
          page_size?: string
          sort_order?: number
          template_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          is_active?: boolean
          key?: string
          label_en?: string
          label_tr?: string
          orientation?: string
          page_size?: string
          sort_order?: number
          template_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          content_search: string | null
          created_at: string
          data: Json
          data_hash: string | null
          deleted_at: string | null
          deleted_by: string | null
          document_type_id: number
          file_id: number | null
          generated_at: string | null
          generated_by: string | null
          id: number
          language: string
          operation_id: number | null
          supersedes_id: number | null
          updated_at: string
          version: number
        }
        Insert: {
          content_search?: string | null
          created_at?: string
          data?: Json
          data_hash?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          document_type_id: number
          file_id?: number | null
          generated_at?: string | null
          generated_by?: string | null
          id?: never
          language?: string
          operation_id?: number | null
          supersedes_id?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          content_search?: string | null
          created_at?: string
          data?: Json
          data_hash?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          document_type_id?: number
          file_id?: number | null
          generated_at?: string | null
          generated_by?: string | null
          id?: never
          language?: string
          operation_id?: number | null
          supersedes_id?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_tags: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: number
          entity_type: string
          id: number
          tag_id: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: number
          entity_type: string
          id?: never
          tag_id: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: number
          entity_type?: string
          id?: never
          tag_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "entity_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      event_log: {
        Row: {
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: number
          occurred_at: string
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: never
          occurred_at?: string
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: never
          occurred_at?: string
          payload?: Json
        }
        Relationships: []
      }
      files: {
        Row: {
          bucket: string
          category: Database["public"]["Enums"]["file_category"]
          checksum: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: number
          mime_type: string | null
          original_name: string
          replaces_file_id: number | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          bucket: string
          category?: Database["public"]["Enums"]["file_category"]
          checksum?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          mime_type?: string | null
          original_name: string
          replaces_file_id?: number | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          bucket?: string
          category?: Database["public"]["Enums"]["file_category"]
          checksum?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          mime_type?: string | null
          original_name?: string
          replaces_file_id?: number | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "files_replaces_file_id_fkey"
            columns: ["replaces_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          column_mapping: Json | null
          created_at: string
          created_by: string | null
          entity_type: string
          error_rows: number
          file_name: string | null
          id: number
          inserted_rows: number
          total_rows: number
          undone_at: string | null
          undone_by: string | null
        }
        Insert: {
          column_mapping?: Json | null
          created_at?: string
          created_by?: string | null
          entity_type: string
          error_rows?: number
          file_name?: string | null
          id?: never
          inserted_rows?: number
          total_rows?: number
          undone_at?: string | null
          undone_by?: string | null
        }
        Update: {
          column_mapping?: Json | null
          created_at?: string
          created_by?: string | null
          entity_type?: string
          error_rows?: number
          file_name?: string | null
          id?: never
          inserted_rows?: number
          total_rows?: number
          undone_at?: string | null
          undone_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      interaction_channels: {
        Row: {
          color: string | null
          created_at: string
          id: number
          is_active: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      interaction_outcomes: {
        Row: {
          color: string | null
          created_at: string
          id: number
          is_active: boolean
          is_positive: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_positive?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_positive?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      interactions: {
        Row: {
          channel_id: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          direction: string
          entity_id: number
          entity_type: string
          id: number
          occurred_at: string
          operation_id: number | null
          outcome_id: number | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          channel_id: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          direction?: string
          entity_id: number
          entity_type: string
          id?: never
          occurred_at?: string
          operation_id?: number | null
          outcome_id?: number | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          channel_id?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          direction?: string
          entity_id?: number
          entity_type?: string
          id?: never
          occurred_at?: string
          operation_id?: number | null
          outcome_id?: number | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "interaction_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "interaction_outcomes"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          color: string | null
          created_at: string
          id: number
          is_active: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      lead_statuses: {
        Row: {
          color: string | null
          created_at: string
          id: number
          is_active: boolean
          is_closed: boolean
          is_default: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_closed?: boolean
          is_default?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_closed?: boolean
          is_default?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          address: string | null
          assigned_to: string | null
          city: string | null
          city_normalized: string | null
          company_name: string | null
          company_name_normalized: string | null
          converted_at: string | null
          converted_by: string | null
          converted_customer_id: number | null
          country: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          district: string | null
          external_id: string | null
          external_source: string | null
          first_contact_channel_id: number | null
          first_contact_date: string | null
          full_name: string | null
          full_name_normalized: string | null
          id: number
          import_batch_id: number | null
          last_interaction_at: string | null
          next_action_at: string | null
          source_id: number | null
          status_id: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          assigned_to?: string | null
          city?: string | null
          city_normalized?: string | null
          company_name?: string | null
          company_name_normalized?: string | null
          converted_at?: string | null
          converted_by?: string | null
          converted_customer_id?: number | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          district?: string | null
          external_id?: string | null
          external_source?: string | null
          first_contact_channel_id?: number | null
          first_contact_date?: string | null
          full_name?: string | null
          full_name_normalized?: string | null
          id?: never
          import_batch_id?: number | null
          last_interaction_at?: string | null
          next_action_at?: string | null
          source_id?: number | null
          status_id: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          assigned_to?: string | null
          city?: string | null
          city_normalized?: string | null
          company_name?: string | null
          company_name_normalized?: string | null
          converted_at?: string | null
          converted_by?: string | null
          converted_customer_id?: number | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          district?: string | null
          external_id?: string | null
          external_source?: string | null
          first_contact_channel_id?: number | null
          first_contact_date?: string | null
          full_name?: string | null
          full_name_normalized?: string | null
          id?: never
          import_batch_id?: number | null
          last_interaction_at?: string | null
          next_action_at?: string | null
          source_id?: number | null
          status_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_by_fkey"
            columns: ["converted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_customer_id_fkey"
            columns: ["converted_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "lead_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          entity_id: number
          entity_type: string
          id: number
          is_internal: boolean
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id: number
          entity_type: string
          id?: never
          is_internal?: boolean
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id?: number
          entity_type?: string
          id?: never
          is_internal?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_catalog_items: {
        Row: {
          catalog_product_code: string
          created_at: string
          created_by: string | null
          id: number
          label: string | null
          operation_id: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          catalog_product_code: string
          created_at?: string
          created_by?: string | null
          id?: never
          label?: string | null
          operation_id: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          catalog_product_code?: string
          created_at?: string
          created_by?: string | null
          id?: never
          label?: string | null
          operation_id?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_catalog_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_catalog_items_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_items: {
        Row: {
          colors: string[] | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          fabric: string | null
          id: number
          label_request: string | null
          name: string
          operation_id: number
          packaging_request: string | null
          print_embroidery: string | null
          quantity: number | null
          sizes: Json | null
          sort_order: number
          technical_notes: string | null
          updated_at: string
        }
        Insert: {
          colors?: string[] | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          fabric?: string | null
          id?: never
          label_request?: string | null
          name: string
          operation_id: number
          packaging_request?: string | null
          print_embroidery?: string | null
          quantity?: number | null
          sizes?: Json | null
          sort_order?: number
          technical_notes?: string | null
          updated_at?: string
        }
        Update: {
          colors?: string[] | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          fabric?: string | null
          id?: never
          label_request?: string | null
          name?: string
          operation_id?: number
          packaging_request?: string | null
          print_embroidery?: string | null
          quantity?: number | null
          sizes?: Json | null
          sort_order?: number
          technical_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_items_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_stages: {
        Row: {
          color: string | null
          created_at: string
          id: number
          is_active: boolean
          is_default: boolean
          is_system: boolean
          is_terminal: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_default?: boolean
          is_system?: boolean
          is_terminal?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_default?: boolean
          is_system?: boolean
          is_terminal?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      operations: {
        Row: {
          cancellation_note: string | null
          cancellation_reason_id: number | null
          cancelled_at: string | null
          cancelled_by: string | null
          category_id: number | null
          channel_id: number | null
          client_reference: string | null
          code: string
          created_at: string
          created_by: string | null
          customer_id: number
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          district: string | null
          district_normalized: string | null
          expected_delivery: string | null
          id: number
          legacy_code: string | null
          owner_id: string | null
          product_source: string | null
          province_id: number | null
          request_status_id: number | null
          requested_at: string
          sla_deadline: string | null
          source: string
          stage_id: number | null
          target_price: number | null
          target_price_currency: string | null
          title: string | null
          title_normalized: string | null
          type_id: number | null
          updated_at: string
        }
        Insert: {
          cancellation_note?: string | null
          cancellation_reason_id?: number | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category_id?: number | null
          channel_id?: number | null
          client_reference?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          customer_id: number
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          district?: string | null
          district_normalized?: string | null
          expected_delivery?: string | null
          id?: never
          legacy_code?: string | null
          owner_id?: string | null
          product_source?: string | null
          province_id?: number | null
          request_status_id?: number | null
          requested_at?: string
          sla_deadline?: string | null
          source?: string
          stage_id?: number | null
          target_price?: number | null
          target_price_currency?: string | null
          title?: string | null
          title_normalized?: string | null
          type_id?: number | null
          updated_at?: string
        }
        Update: {
          cancellation_note?: string | null
          cancellation_reason_id?: number | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category_id?: number | null
          channel_id?: number | null
          client_reference?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          customer_id?: number
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          district?: string | null
          district_normalized?: string | null
          expected_delivery?: string | null
          id?: never
          legacy_code?: string | null
          owner_id?: string | null
          product_source?: string | null
          province_id?: number | null
          request_status_id?: number | null
          requested_at?: string
          sla_deadline?: string | null
          source?: string
          stage_id?: number | null
          target_price?: number | null
          target_price_currency?: string | null
          title?: string | null
          title_normalized?: string | null
          type_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operations_cancellation_reason_id_fkey"
            columns: ["cancellation_reason_id"]
            isOneToOne: false
            referencedRelation: "cancellation_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "request_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "provinces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_request_status_id_fkey"
            columns: ["request_status_id"]
            isOneToOne: false
            referencedRelation: "request_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "operation_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          discount_rate: number
          id: number
          line_total: number | null
          name: string
          operation_item_id: number | null
          order_id: number
          produced_quantity: number
          quantity: number
          sort_order: number
          unit: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          discount_rate?: number
          id?: never
          line_total?: number | null
          name: string
          operation_item_id?: number | null
          order_id: number
          produced_quantity?: number
          quantity?: number
          sort_order?: number
          unit?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          discount_rate?: number
          id?: never
          line_total?: number | null
          name?: string
          operation_item_id?: number | null
          order_id?: number
          produced_quantity?: number
          quantity?: number
          sort_order?: number
          unit?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_operation_item_id_fkey"
            columns: ["operation_item_id"]
            isOneToOne: false
            referencedRelation: "operation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_statuses: {
        Row: {
          color: string | null
          created_at: string
          id: number
          is_active: boolean
          is_closed: boolean
          is_default: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_closed?: boolean
          is_default?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_closed?: boolean
          is_default?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          actual_delivery: string | null
          advance_due_date: string | null
          balance_due_date: string | null
          carrier: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          deleted_by: string | null
          delivery_address: string | null
          delivery_notes: string | null
          extracted_data: Json | null
          extraction_source: string
          held_at: string | null
          hold_reason: string | null
          id: number
          operation_id: number
          order_date: string
          order_file_id: number | null
          payment_term_id: number | null
          planned_delivery: string | null
          production_notes: string | null
          promised_delivery: string | null
          quote_id: number | null
          sample_id: number | null
          shipped_at: string | null
          status_id: number | null
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          actual_delivery?: string | null
          advance_due_date?: string | null
          balance_due_date?: string | null
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_address?: string | null
          delivery_notes?: string | null
          extracted_data?: Json | null
          extraction_source?: string
          held_at?: string | null
          hold_reason?: string | null
          id?: never
          operation_id: number
          order_date?: string
          order_file_id?: number | null
          payment_term_id?: number | null
          planned_delivery?: string | null
          production_notes?: string | null
          promised_delivery?: string | null
          quote_id?: number | null
          sample_id?: number | null
          shipped_at?: string | null
          status_id?: number | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          actual_delivery?: string | null
          advance_due_date?: string | null
          balance_due_date?: string | null
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_address?: string | null
          delivery_notes?: string | null
          extracted_data?: Json | null
          extraction_source?: string
          held_at?: string | null
          hold_reason?: string | null
          id?: never
          operation_id?: number
          order_date?: string
          order_file_id?: number | null
          payment_term_id?: number | null
          planned_delivery?: string | null
          production_notes?: string | null
          promised_delivery?: string | null
          quote_id?: number | null
          sample_id?: number | null
          shipped_at?: string | null
          status_id?: number | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_order_file_id_fkey"
            columns: ["order_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_payment_term_id_fkey"
            columns: ["payment_term_id"]
            isOneToOne: false
            referencedRelation: "payment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_terms: {
        Row: {
          color: string | null
          created_at: string
          id: number
          is_active: boolean
          is_default: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_default?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_default?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          amount_try: number | null
          amount_usd: number | null
          bank_account_id: number | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: number | null
          deleted_at: string | null
          deleted_by: string | null
          direction: string
          exchange_rate: number | null
          id: number
          is_advance: boolean
          kind: string
          note: string | null
          operation_id: number | null
          order_id: number | null
          paid_at: string
          payment_method_id: number | null
          reference_no: string | null
          updated_at: string
          usd_rate: number | null
        }
        Insert: {
          amount: number
          amount_try?: number | null
          amount_usd?: number | null
          bank_account_id?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          direction?: string
          exchange_rate?: number | null
          id?: never
          is_advance?: boolean
          kind?: string
          note?: string | null
          operation_id?: number | null
          order_id?: number | null
          paid_at?: string
          payment_method_id?: number | null
          reference_no?: string | null
          updated_at?: string
          usd_rate?: number | null
        }
        Update: {
          amount?: number
          bank_account_id?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          direction?: string
          id?: never
          is_advance?: boolean
          kind?: string
          note?: string | null
          operation_id?: number | null
          order_id?: number | null
          paid_at?: string
          payment_method_id?: number | null
          reference_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          created_at: string
          description: string | null
          id: number
          key: string
          module: string
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          id?: never
          key: string
          module: string
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          id?: never
          key?: string
          module?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          code: string
          created_at: string
          department_id: number | null
          id: number
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          department_id?: number | null
          id?: never
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          department_id?: number | null
          id?: never
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          color: string | null
          created_at: string
          id: number
          is_active: boolean
          is_system: boolean
          key: string
          label: string
          parent_id: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          key: string
          label: string
          parent_id?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          key?: string
          label?: string
          parent_id?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      provinces: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          name: string
          plate_code: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_active?: boolean
          name: string
          plate_code: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          is_active?: boolean
          name?: string
          plate_code?: number
          updated_at?: string
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          discount_rate: number
          id: number
          line_total: number | null
          name: string
          operation_item_id: number | null
          quantity: number
          quote_id: number
          sort_order: number
          unit: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          discount_rate?: number
          id?: never
          line_total?: number | null
          name: string
          operation_item_id?: number | null
          quantity?: number
          quote_id: number
          sort_order?: number
          unit?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          discount_rate?: number
          id?: never
          line_total?: number | null
          name?: string
          operation_item_id?: number | null
          quantity?: number
          quote_id?: number
          sort_order?: number
          unit?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_operation_item_id_fkey"
            columns: ["operation_item_id"]
            isOneToOne: false
            referencedRelation: "operation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_rejection_reasons: {
        Row: {
          color: string | null
          created_at: string
          id: number
          is_active: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      quote_statuses: {
        Row: {
          color: string | null
          created_at: string
          id: number
          is_active: boolean
          is_closed: boolean
          is_default: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_closed?: boolean
          is_default?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_closed?: boolean
          is_default?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          commercial_notes: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          deleted_by: string | null
          id: number
          internal_notes: string | null
          lead_time_days: number | null
          operation_id: number
          payment_term_id: number | null
          quote_file_id: number | null
          rejection_note: string | null
          rejection_reason_id: number | null
          responded_at: string | null
          sent_at: string | null
          sent_by: string | null
          sent_channel: string | null
          status_id: number | null
          subtotal: number
          supersedes_quote_id: number | null
          tax_amount: number
          tax_rate: number
          technical_notes: string | null
          total: number
          updated_at: string
          valid_until: string
          version: number
        }
        Insert: {
          commercial_notes?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: never
          internal_notes?: string | null
          lead_time_days?: number | null
          operation_id: number
          payment_term_id?: number | null
          quote_file_id?: number | null
          rejection_note?: string | null
          rejection_reason_id?: number | null
          responded_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_channel?: string | null
          status_id?: number | null
          subtotal?: number
          supersedes_quote_id?: number | null
          tax_amount?: number
          tax_rate: number
          technical_notes?: string | null
          total?: number
          updated_at?: string
          valid_until: string
          version: number
        }
        Update: {
          commercial_notes?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: never
          internal_notes?: string | null
          lead_time_days?: number | null
          operation_id?: number
          payment_term_id?: number | null
          quote_file_id?: number | null
          rejection_note?: string | null
          rejection_reason_id?: number | null
          responded_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_channel?: string | null
          status_id?: number | null
          subtotal?: number
          supersedes_quote_id?: number | null
          tax_amount?: number
          tax_rate?: number
          technical_notes?: string | null
          total?: number
          updated_at?: string
          valid_until?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_payment_term_id_fkey"
            columns: ["payment_term_id"]
            isOneToOne: false
            referencedRelation: "payment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_quote_file_id_fkey"
            columns: ["quote_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_rejection_reason_id_fkey"
            columns: ["rejection_reason_id"]
            isOneToOne: false
            referencedRelation: "quote_rejection_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "quote_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_supersedes_quote_id_fkey"
            columns: ["supersedes_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      request_channels: {
        Row: {
          color: string | null
          created_at: string
          id: number
          is_active: boolean
          is_default: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_default?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_default?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      request_statuses: {
        Row: {
          color: string | null
          created_at: string
          id: number
          is_active: boolean
          is_closed: boolean
          is_default: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_closed?: boolean
          is_default?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_closed?: boolean
          is_default?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: number
          role_id: number
        }
        Insert: {
          created_at?: string
          permission_id: number
          role_id: number
        }
        Update: {
          created_at?: string
          permission_id?: number
          role_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          key: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      sample_statuses: {
        Row: {
          color: string | null
          created_at: string
          id: number
          is_active: boolean
          is_closed: boolean
          is_default: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_closed?: boolean
          is_default?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_closed?: boolean
          is_default?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      samples: {
        Row: {
          approval_method: string | null
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          carrier: string | null
          created_at: string
          created_by: string | null
          deduct_from_order: boolean
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          fee: number | null
          fee_currency: string
          id: number
          operation_id: number
          quote_id: number | null
          received_at: string | null
          rejection_reason: string | null
          revision_of_sample_id: number | null
          revision_reason: string | null
          revision_round: number
          shipped_at: string | null
          status_id: number | null
          tracking_number: string | null
          updated_at: string
          version: number
        }
        Insert: {
          approval_method?: string | null
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          deduct_from_order?: boolean
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          fee?: number | null
          fee_currency?: string
          id?: never
          operation_id: number
          quote_id?: number | null
          received_at?: string | null
          rejection_reason?: string | null
          revision_of_sample_id?: number | null
          revision_reason?: string | null
          revision_round?: number
          shipped_at?: string | null
          status_id?: number | null
          tracking_number?: string | null
          updated_at?: string
          version: number
        }
        Update: {
          approval_method?: string | null
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          deduct_from_order?: boolean
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          fee?: number | null
          fee_currency?: string
          id?: never
          operation_id?: number
          quote_id?: number | null
          received_at?: string | null
          rejection_reason?: string | null
          revision_of_sample_id?: number | null
          revision_reason?: string | null
          revision_round?: number
          shipped_at?: string | null
          status_id?: number | null
          tracking_number?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "samples_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_revision_of_sample_id_fkey"
            columns: ["revision_of_sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "sample_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      setting_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: number
          new_value: Json | null
          old_value: Json | null
          setting_key: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_value?: Json | null
          old_value?: Json | null
          setting_key: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_value?: Json | null
          old_value?: Json | null
          setting_key?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          category: string
          description: string | null
          is_deprecated: boolean
          is_sensitive: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          category: string
          description?: string | null
          is_deprecated?: boolean
          is_sensitive?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          category?: string
          description?: string | null
          is_deprecated?: boolean
          is_sensitive?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      status_transitions: {
        Row: {
          created_at: string
          entity_type: string
          from_key: string
          id: number
          is_active: boolean
          is_system: boolean
          requires_reason: boolean
          sort_order: number
          to_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_type: string
          from_key: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          requires_reason?: boolean
          sort_order?: number
          to_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_type?: string
          from_key?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          requires_reason?: boolean
          sort_order?: number
          to_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: number
          is_active: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_permission_overrides: {
        Row: {
          created_at: string
          expires_at: string | null
          granted: boolean
          granted_by: string | null
          id: number
          permission_id: number
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted: boolean
          granted_by?: string | null
          id?: never
          permission_id: number
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted?: boolean
          granted_by?: string | null
          id?: never
          permission_id?: number
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_file_id: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          department_id: number | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          must_change_password: boolean
          phone: string | null
          position_id: number | null
          role_id: number | null
          updated_at: string
        }
        Insert: {
          avatar_file_id?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: number | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          last_login_at?: string | null
          must_change_password?: boolean
          phone?: string | null
          position_id?: number | null
          role_id?: number | null
          updated_at?: string
        }
        Update: {
          avatar_file_id?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: number | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          must_change_password?: boolean
          phone?: string | null
          position_id?: number | null
          role_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_avatar_file_id_fkey"
            columns: ["avatar_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_working_hours: {
        Args: { p_from: string; p_hours: number }
        Returns: string
      }
      app_timezone: { Args: never; Returns: string }
      build_document_data: {
        Args: { p_language?: string; p_operation_id: number; p_type: string }
        Returns: Json
      }
      check_import_duplicates: {
        Args: { p_rows: Json }
        Returns: {
          idx: number
          matched: boolean
          reason: string
        }[]
      }
      claim_operation: { Args: { p_operation_id: number }; Returns: Json }
      document_uretici: { Args: Record<string, never>; Returns: Json }
      process_open_file_alerts: { Args: Record<string, never>; Returns: number }
      process_delivery_warnings: { Args: Record<string, never>; Returns: number }
      daily_summary: { Args: Record<string, never>; Returns: Json }
      snooze_open_file: { Args: { p_open_file_id: number; p_reason: string; p_until: string }; Returns: Json }
      convert_lead_to_customer: {
        Args: {
          p_customer_type_id: number
          p_iban?: string
          p_lead_id: number
          p_tax_number?: string
          p_tax_office?: string
        }
        Returns: number
      }
      create_quote_revision: { Args: { p_quote_id: number }; Returns: number }
      current_app_user: {
        Args: never
        Returns: {
          avatar_file_id: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          department_id: number | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          must_change_password: boolean
          phone: string | null
          position_id: number | null
          role_id: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      file_record_exists: {
        Args: { p_bucket: string; p_path: string }
        Returns: boolean
      }
      find_duplicates: {
        Args: {
          p_company?: string
          p_exclude_id?: number
          p_exclude_type?: string
          p_phone?: string
          p_tax_number?: string
        }
        Returns: {
          code: string
          entity_type: string
          id: number
          reason: string
          subtitle: string
          title: string
        }[]
      }
      generate_operation_code: {
        Args: { p_entity_id?: string; p_entity_type: string }
        Returns: string
      }
      global_search: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          code: string
          entity_type: string
          id: number
          reason: string
          status_label: string
          subtitle: string
          title: string
        }[]
      }
      has_permission: { Args: { permission_key: string }; Returns: boolean }
      current_rates: { Args: Record<string, never>; Returns: Json }
      set_exchange_rate: { Args: { p_currency: string; p_rate: number; p_source?: string }; Returns: undefined }
      save_product_cost: { Args: { p_product_id: number; p_items: Json; p_total_try: number; p_total_usd: number; p_rates: Json; p_notes: string | null }; Returns: number }
      product_price: { Args: { p_product_id: number; p_quantity: number }; Returns: Json }
      rate_to_try: { Args: { p_currency: string }; Returns: number }
      rate_on_date: { Args: { p_currency: string; p_date: string }; Returns: number }
      cache_historical_rate: { Args: { p_currency: string; p_rate: number; p_date: string }; Returns: undefined }
      customer_balance: { Args: { p_customer_id: number; p_as_of?: string }; Returns: { balance_usd: number; balance_try: number; last_transaction_at: string | null }[] }
      reverse_account_transaction: { Args: { p_id: number; p_reason: string }; Returns: number }
      order_paid_summary: { Args: { p_order_id: number }; Returns: Json }
      order_advance_check: { Args: { p_order_id: number }; Returns: Json }
      advance_override: { Args: { p_order_id: number; p_reason: string }; Returns: Json }
      process_payment_due_warnings: { Args: Record<string, never>; Returns: number }
      finance_summary: { Args: Record<string, never>; Returns: Json }
      goal_actual: { Args: { p_goal_id: number }; Returns: number }
      task_subtree_progress: { Args: { p_task_id: number }; Returns: number }
      user_workload: { Args: { p_user_id: string }; Returns: { open_count: number; estimated_hours: number }[] }
      task_blocking: { Args: { p_task_id: number }; Returns: { depends_on_task_id: number; title: string; status_key: string }[] }
      operation_task_suggestions: { Args: { p_operation_id: number }; Returns: { template_id: number; trigger_event: string; title: string; description: string | null; priority_id: number | null; assignee_rule: string; resolved_assignee: string | null; due_offset_hours: number }[] }
      operation_workflow_suggestions: { Args: { p_operation_id: number }; Returns: { step_id: number; workflow_name: string; trigger_event: string; title: string; description: string | null; priority_id: number | null; assignee_rule: string; resolved_assignee: string | null; due_offset_hours: number }[] }
      accept_task_suggestion: { Args: { p_operation_id: number; p_kind: string; p_ref_id: number; p_title: string; p_description: string | null; p_priority_id: number | null; p_assigned_to: string | null; p_due_at: string | null }; Returns: number }
      dismiss_task_suggestion: { Args: { p_operation_id: number; p_kind: string; p_ref_id: number; p_reason: string | null }; Returns: undefined }
      ai_calls_today: { Args: Record<string, never>; Returns: number }
      process_task_due_warnings: { Args: Record<string, never>; Returns: number }
      process_goal_notifications: { Args: Record<string, never>; Returns: number }
      ai_spend_summary: { Args: Record<string, never>; Returns: Json }
      open_balances: { Args: Record<string, never>; Returns: { customer_id: number; customer_name: string; balance_usd: number; balance_try: number; last_at: string | null }[] }
      due_payments: { Args: Record<string, never>; Returns: { order_id: number; operation_id: number; operation_code: string; customer_id: number; customer_name: string; due_kind: string; due_date: string; days_left: number; amount_usd: number; sufficient: boolean }[] }
      post_account_transaction: { Args: { p_customer_id: number; p_direction: string; p_source_type: string; p_amount: number; p_currency: string; p_source_id?: number | null; p_operation_id?: number | null; p_exchange_rate?: number | null; p_usd_rate?: number | null; p_occurred_at?: string | null; p_description?: string | null; p_reverses_id?: number | null; p_created_by?: string | null }; Returns: number }
      is_active_user: { Args: never; Returns: boolean }
      is_admin_or_owner: { Args: never; Returns: boolean }
      log_dedup_override: {
        Args: {
          p_company?: string
          p_entity_id: number
          p_entity_type: string
          p_phone?: string
          p_tax_number?: string
        }
        Returns: undefined
      }
      log_event: {
        Args: {
          p_entity_id?: string
          p_entity_type?: string
          p_event_type: string
          p_occurred_at?: string
          p_payload?: Json
        }
        Returns: number
      }
      log_soft_gate_override: {
        Args: { p_gate: string; p_operation_id: number; p_reason: string }
        Returns: undefined
      }
      normalize_company_core: { Args: { input: string }; Returns: string }
      normalize_company_core_arr: {
        Args: { input: string; p_stop: string[] }
        Returns: string
      }
      normalize_contact_value: {
        Args: { p_type: string; p_value: string }
        Returns: string
      }
      normalize_tr: { Args: { input: string }; Returns: string }
      operation_revisions: {
        Args: { p_operation_id: number }
        Returns: {
          action: string
          actor_email: string
          actor_id: string
          changed_fields: string[]
          created_at: string
          id: number
          new_values: Json
          old_values: Json
          table_name: string
        }[]
      }
      quote_default_tax_rate: { Args: never; Returns: number }
      quote_default_validity_days: { Args: never; Returns: number }
      recompute_order_totals: {
        Args: { p_order_id: number }
        Returns: undefined
      }
      recompute_quote_totals: {
        Args: { p_quote_id: number }
        Returns: undefined
      }
      require_siparis_onay: {
        Args: { p_operation_id: number }
        Returns: undefined
      }
      revise_sample: {
        Args: { p_reason: string; p_sample_id: number }
        Returns: number
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sla_sweep: { Args: never; Returns: number }
      undo_import_batch: { Args: { p_batch_id: number }; Returns: Json }
    }
    Enums: {
      audit_action: "insert" | "update" | "delete" | "restore"
      audit_source: "user" | "system" | "automation" | "migration" | "import"
      file_category: "document" | "image" | "avatar" | "export" | "other"
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
    Enums: {
      audit_action: ["insert", "update", "delete", "restore"],
      audit_source: ["user", "system", "automation", "migration", "import"],
      file_category: ["document", "image", "avatar", "export", "other"],
    },
  },
} as const
