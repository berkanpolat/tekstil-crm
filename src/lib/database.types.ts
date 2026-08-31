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
      account_transactions: {
        Row: {
          amount: number
          amount_try: number
          amount_usd: number
          created_at: string
          created_by: string | null
          currency: string
          customer_id: number
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          direction: string
          exchange_rate: number
          id: number
          occurred_at: string
          operation_id: number | null
          reverses_id: number | null
          source_id: number | null
          source_type: string
          updated_at: string
          usd_rate: number
        }
        Insert: {
          amount: number
          amount_try: number
          amount_usd: number
          created_at?: string
          created_by?: string | null
          currency: string
          customer_id: number
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          direction: string
          exchange_rate: number
          id?: never
          occurred_at?: string
          operation_id?: number | null
          reverses_id?: number | null
          source_id?: number | null
          source_type: string
          updated_at?: string
          usd_rate: number
        }
        Update: {
          amount?: number
          amount_try?: number
          amount_usd?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: number
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          direction?: string
          exchange_rate?: number
          id?: never
          occurred_at?: string
          operation_id?: number | null
          reverses_id?: number | null
          source_id?: number | null
          source_type?: string
          updated_at?: string
          usd_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "account_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_transactions_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_transactions_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_transactions_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "account_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_requests: {
        Row: {
          accepted: boolean | null
          corrected_fields: string[] | null
          created_at: string
          duration_ms: number | null
          estimated_cost_usd: number | null
          feature: string
          id: number
          input_summary: Json
          model: string | null
          payload_hash: string | null
          rejected_reason: string | null
          response_summary: string | null
          status: string
          tokens_in: number | null
          tokens_out: number | null
          user_id: string | null
        }
        Insert: {
          accepted?: boolean | null
          corrected_fields?: string[] | null
          created_at?: string
          duration_ms?: number | null
          estimated_cost_usd?: number | null
          feature: string
          id?: never
          input_summary?: Json
          model?: string | null
          payload_hash?: string | null
          rejected_reason?: string | null
          response_summary?: string | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Update: {
          accepted?: boolean | null
          corrected_fields?: string[] | null
          created_at?: string
          duration_ms?: number | null
          estimated_cost_usd?: number | null
          feature?: string
          id?: never
          input_summary?: Json
          model?: string | null
          payload_hash?: string | null
          rejected_reason?: string | null
          response_summary?: string | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
      bank_accounts: {
        Row: {
          account_name: string | null
          bank_name: string
          created_at: string
          currency: string
          iban: string | null
          id: number
          is_active: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          bank_name: string
          created_at?: string
          currency?: string
          iban?: string | null
          id?: never
          is_active?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          bank_name?: string
          created_at?: string
          currency?: string
          iban?: string | null
          id?: never
          is_active?: boolean
          sort_order?: number
          updated_at?: string
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
      catalog_collections: {
        Row: {
          catalog_id: number
          code: string | null
          created_at: string
          id: number
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          catalog_id: number
          code?: string | null
          created_at?: string
          id?: number
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          catalog_id?: number
          code?: string | null
          created_at?: string
          id?: number
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_collections_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_product_images: {
        Row: {
          created_at: string
          file_id: number
          id: number
          image_type: string
          product_id: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          file_id: number
          id?: number
          image_type?: string
          product_id: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          file_id?: number
          id?: number
          image_type?: string
          product_id?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_product_images_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_products: {
        Row: {
          catalog_id: number
          category_id: number | null
          code: string
          collection_id: number | null
          colors: Json
          composition: string | null
          created_at: string
          created_by: string | null
          custom_margin_percent: number | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          fabric_group_id: number | null
          fabric_type_id: number | null
          fit_type_id: number | null
          gramaj: number | null
          has_print: boolean
          id: number
          is_active: boolean
          moq: number
          name: string
          name_normalized: string | null
          print_details: string | null
          print_type_id: number | null
          site_code: string | null
          size_system: string | null
          sizes: string[]
          slug: string | null
          sort_order: number
          source_code: string | null
          type_id: number | null
          updated_at: string
        }
        Insert: {
          catalog_id: number
          category_id?: number | null
          code: string
          collection_id?: number | null
          colors?: Json
          composition?: string | null
          created_at?: string
          created_by?: string | null
          custom_margin_percent?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          fabric_group_id?: number | null
          fabric_type_id?: number | null
          fit_type_id?: number | null
          gramaj?: number | null
          has_print?: boolean
          id?: number
          is_active?: boolean
          moq?: number
          name: string
          name_normalized?: string | null
          print_details?: string | null
          print_type_id?: number | null
          site_code?: string | null
          size_system?: string | null
          sizes?: string[]
          slug?: string | null
          sort_order?: number
          source_code?: string | null
          type_id?: number | null
          updated_at?: string
        }
        Update: {
          catalog_id?: number
          category_id?: number | null
          code?: string
          collection_id?: number | null
          colors?: Json
          composition?: string | null
          created_at?: string
          created_by?: string | null
          custom_margin_percent?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          fabric_group_id?: number | null
          fabric_type_id?: number | null
          fit_type_id?: number | null
          gramaj?: number | null
          has_print?: boolean
          id?: number
          is_active?: boolean
          moq?: number
          name?: string
          name_normalized?: string | null
          print_details?: string | null
          print_type_id?: number | null
          site_code?: string | null
          size_system?: string | null
          sizes?: string[]
          slug?: string | null
          sort_order?: number
          source_code?: string | null
          type_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_products_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "catalog_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_fabric_group_id_fkey"
            columns: ["fabric_group_id"]
            isOneToOne: false
            referencedRelation: "fabric_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_fabric_type_id_fkey"
            columns: ["fabric_type_id"]
            isOneToOne: false
            referencedRelation: "fabric_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_fit_type_id_fkey"
            columns: ["fit_type_id"]
            isOneToOne: false
            referencedRelation: "fit_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_print_type_id_fkey"
            columns: ["print_type_id"]
            isOneToOne: false
            referencedRelation: "print_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_yscode_migration: {
        Row: {
          catalog_product_id: number
          migrated_at: string
          new_code: string
          old_code: string
          source_code: string | null
        }
        Insert: {
          catalog_product_id: number
          migrated_at?: string
          new_code: string
          old_code: string
          source_code?: string | null
        }
        Update: {
          catalog_product_id?: number
          migrated_at?: string
          new_code?: string
          old_code?: string
          source_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_yscode_migration_catalog_product_id_fkey"
            columns: ["catalog_product_id"]
            isOneToOne: true
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogs: {
        Row: {
          cover_file_id: number | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: number
          is_active: boolean
          name: string
          published_at: string | null
          season: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          cover_file_id?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: number
          is_active?: boolean
          name: string
          published_at?: string | null
          season?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          cover_file_id?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: number
          is_active?: boolean
          name?: string
          published_at?: string | null
          season?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogs_cover_file_id_fkey"
            columns: ["cover_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
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
      conversations: {
        Row: {
          channel_id: number
          created_at: string
          entity_id: number
          entity_type: string
          external_id: string | null
          external_source: string | null
          id: number
          is_archived: boolean
          last_message_at: string | null
          peer_identifier: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          channel_id: number
          created_at?: string
          entity_id: number
          entity_type: string
          external_id?: string | null
          external_source?: string | null
          id?: never
          is_archived?: boolean
          last_message_at?: string | null
          peer_identifier?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          channel_id?: number
          created_at?: string
          entity_id?: number
          entity_type?: string
          external_id?: string | null
          external_source?: string | null
          id?: never
          is_archived?: boolean
          last_message_at?: string | null
          peer_identifier?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "interaction_channels"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "customers_first_contact_channel_id_fkey"
            columns: ["first_contact_channel_id"]
            isOneToOne: false
            referencedRelation: "interaction_channels"
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
          is_draft: boolean
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
          is_draft?: boolean
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
          is_draft?: boolean
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
      exchange_rates: {
        Row: {
          currency: string
          fetched_at: string
          id: number
          is_current: boolean
          rate_date: string | null
          rate_try: number
          source: string
        }
        Insert: {
          currency: string
          fetched_at?: string
          id?: number
          is_current?: boolean
          rate_date?: string | null
          rate_try: number
          source?: string
        }
        Update: {
          currency?: string
          fetched_at?: string
          id?: number
          is_current?: boolean
          rate_date?: string | null
          rate_try?: number
          source?: string
        }
        Relationships: []
      }
      fabric_groups: {
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
      fabric_types: {
        Row: {
          created_at: string
          group_id: number
          id: number
          is_active: boolean
          is_system: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: number
          id?: never
          is_active?: boolean
          is_system?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: number
          id?: never
          is_active?: boolean
          is_system?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fabric_types_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "fabric_groups"
            referencedColumns: ["id"]
          },
        ]
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
      fit_types: {
        Row: {
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
      goals: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string | null
          goal_type: string
          id: number
          is_active: boolean
          name: string
          period_end: string
          period_start: string
          period_type: string
          risk_notified_at: string | null
          scope: string
          scope_department_id: number | null
          scope_team_id: number | null
          scope_user_id: string | null
          target_value: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string | null
          goal_type: string
          id?: never
          is_active?: boolean
          name: string
          period_end: string
          period_start: string
          period_type: string
          risk_notified_at?: string | null
          scope: string
          scope_department_id?: number | null
          scope_team_id?: number | null
          scope_user_id?: string | null
          target_value: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string | null
          goal_type?: string
          id?: never
          is_active?: boolean
          name?: string
          period_end?: string
          period_start?: string
          period_type?: string
          risk_notified_at?: string | null
          scope?: string
          scope_department_id?: number | null
          scope_team_id?: number | null
          scope_user_id?: string | null
          target_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_scope_department_id_fkey"
            columns: ["scope_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_scope_team_id_fkey"
            columns: ["scope_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_scope_user_id_fkey"
            columns: ["scope_user_id"]
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
            foreignKeyName: "leads_first_contact_channel_id_fkey"
            columns: ["first_contact_channel_id"]
            isOneToOne: false
            referencedRelation: "interaction_channels"
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
      margin_tiers: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          margin_percent: number
          min_quantity: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          is_active?: boolean
          margin_percent: number
          min_quantity: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          is_active?: boolean
          margin_percent?: number
          min_quantity?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      message_template_variables: {
        Row: {
          default_value: string | null
          description: string | null
          external_name: string | null
          id: number
          name: string
          position: number
          source: string
          source_field: string | null
          template_id: number
        }
        Insert: {
          default_value?: string | null
          description?: string | null
          external_name?: string | null
          id?: never
          name: string
          position: number
          source?: string
          source_field?: string | null
          template_id: number
        }
        Update: {
          default_value?: string | null
          description?: string | null
          external_name?: string | null
          id?: never
          name?: string
          position?: number
          source?: string
          source_field?: string | null
          template_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "message_template_variables_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          ai_generated: boolean
          ai_prompt: string | null
          approval_external_id: string | null
          approval_status: string
          approved_at: string | null
          body: string
          channel_id: number | null
          created_at: string
          created_by: string | null
          display_name: string | null
          external_id: string | null
          external_source: string | null
          group_name: string | null
          id: number
          is_active: boolean
          is_followup: boolean
          key: string
          name: string
          rejected_at: string | null
          rejection_reason: string | null
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          ai_prompt?: string | null
          approval_external_id?: string | null
          approval_status?: string
          approved_at?: string | null
          body: string
          channel_id?: number | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          external_id?: string | null
          external_source?: string | null
          group_name?: string | null
          id?: never
          is_active?: boolean
          is_followup?: boolean
          key: string
          name: string
          rejected_at?: string | null
          rejection_reason?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          ai_prompt?: string | null
          approval_external_id?: string | null
          approval_status?: string
          approved_at?: string | null
          body?: string
          channel_id?: number | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          external_id?: string | null
          external_source?: string | null
          group_name?: string | null
          id?: never
          is_active?: boolean
          is_followup?: boolean
          key?: string
          name?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "interaction_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: number
          created_at: string
          delivered_at: string | null
          direction: string
          error_code: string | null
          error_message: string | null
          external_id: string | null
          external_source: string | null
          failed_at: string | null
          id: number
          media_name: string | null
          media_size_bytes: number | null
          media_type: string | null
          media_url: string | null
          provider: string | null
          provider_message_id: string | null
          provider_response: Json | null
          read_at: string | null
          rendered_body: string | null
          sent_at: string | null
          sent_by: string | null
          status: string
          template_id: number | null
          template_variables: Json | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          conversation_id: number
          created_at?: string
          delivered_at?: string | null
          direction: string
          error_code?: string | null
          error_message?: string | null
          external_id?: string | null
          external_source?: string | null
          failed_at?: string | null
          id?: never
          media_name?: string | null
          media_size_bytes?: number | null
          media_type?: string | null
          media_url?: string | null
          provider?: string | null
          provider_message_id?: string | null
          provider_response?: Json | null
          read_at?: string | null
          rendered_body?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          template_id?: number | null
          template_variables?: Json | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          conversation_id?: number
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error_code?: string | null
          error_message?: string | null
          external_id?: string | null
          external_source?: string | null
          failed_at?: string | null
          id?: never
          media_name?: string | null
          media_size_bytes?: number | null
          media_type?: string | null
          media_url?: string | null
          provider?: string | null
          provider_message_id?: string | null
          provider_response?: Json | null
          read_at?: string | null
          rendered_body?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          template_id?: number | null
          template_variables?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
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
      notification_rules: {
        Row: {
          created_at: string
          file_type: string
          id: number
          is_active: boolean
          level: number
          recipient_ref: string | null
          recipient_type: string
          scope: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_type: string
          id?: number
          is_active?: boolean
          level: number
          recipient_ref?: string | null
          recipient_type: string
          scope?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_type?: string
          id?: number
          is_active?: boolean
          level?: number
          recipient_ref?: string | null
          recipient_type?: string
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string
          dismissed_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: number
          read_at: string | null
          severity: string
          silent: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          dismissed_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          read_at?: string | null
          severity?: string
          silent?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          dismissed_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          read_at?: string | null
          severity?: string
          silent?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      open_file_snoozes: {
        Row: {
          created_at: string
          id: number
          open_file_id: number
          reason: string
          snoozed_by: string | null
          snoozed_until: string
        }
        Insert: {
          created_at?: string
          id?: number
          open_file_id: number
          reason: string
          snoozed_by?: string | null
          snoozed_until: string
        }
        Update: {
          created_at?: string
          id?: number
          open_file_id?: number
          reason?: string
          snoozed_by?: string | null
          snoozed_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_file_snoozes_open_file_id_fkey"
            columns: ["open_file_id"]
            isOneToOne: false
            referencedRelation: "open_files"
            referencedColumns: ["id"]
          },
        ]
      }
      open_files: {
        Row: {
          assigned_to: string | null
          close_reason: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          due_at: string
          file_type: string
          final_hour_notified_at: string | null
          id: number
          last_level: number
          last_notified_at: string | null
          opened_at: string
          operation_id: number
          snooze_count: number
          snooze_until: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          due_at: string
          file_type: string
          final_hour_notified_at?: string | null
          id?: number
          last_level?: number
          last_notified_at?: string | null
          opened_at?: string
          operation_id: number
          snooze_count?: number
          snooze_until?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          due_at?: string
          file_type?: string
          final_hour_notified_at?: string | null
          id?: number
          last_level?: number
          last_notified_at?: string | null
          opened_at?: string
          operation_id?: number
          snooze_count?: number
          snooze_until?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_files_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_catalog_items: {
        Row: {
          catalog_product_code: string
          catalog_product_id: number | null
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
          catalog_product_id?: number | null
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
          catalog_product_id?: number | null
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
            foreignKeyName: "operation_catalog_items_catalog_product_id_fkey"
            columns: ["catalog_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
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
          archived_with_customer: boolean
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
          landing_source: string | null
          legacy_code: string | null
          merged_into: number | null
          owner_id: string | null
          possible_merge_with: number | null
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
          archived_with_customer?: boolean
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
          landing_source?: string | null
          legacy_code?: string | null
          merged_into?: number | null
          owner_id?: string | null
          possible_merge_with?: number | null
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
          archived_with_customer?: boolean
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
          landing_source?: string | null
          legacy_code?: string | null
          merged_into?: number | null
          owner_id?: string | null
          possible_merge_with?: number | null
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
            foreignKeyName: "operations_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "operations"
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
            foreignKeyName: "operations_possible_merge_with_fkey"
            columns: ["possible_merge_with"]
            isOneToOne: false
            referencedRelation: "operations"
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
          advance_due_warned_at: string | null
          advance_overdue_at: string | null
          balance_due_date: string | null
          balance_due_warned_at: string | null
          balance_overdue_at: string | null
          carrier: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          deleted_by: string | null
          delivery_address: string | null
          delivery_notes: string | null
          delivery_overdue_at: string | null
          delivery_warned_at: string | null
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
          advance_due_warned_at?: string | null
          advance_overdue_at?: string | null
          balance_due_date?: string | null
          balance_due_warned_at?: string | null
          balance_overdue_at?: string | null
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_address?: string | null
          delivery_notes?: string | null
          delivery_overdue_at?: string | null
          delivery_warned_at?: string | null
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
          advance_due_warned_at?: string | null
          advance_overdue_at?: string | null
          balance_due_date?: string | null
          balance_due_warned_at?: string | null
          balance_overdue_at?: string | null
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_address?: string | null
          delivery_notes?: string | null
          delivery_overdue_at?: string | null
          delivery_warned_at?: string | null
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
      payment_methods: {
        Row: {
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
        Relationships: [
          {
            foreignKeyName: "payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
          {
            foreignKeyName: "payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
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
      print_types: {
        Row: {
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
      product_cost_items: {
        Row: {
          amount: number | null
          calculation_type: string
          cost_id: number
          currency: string
          fabric_name: string | null
          id: number
          item_type: string
          name: string
          quantity: number | null
          sort_order: number
          unit_price: number | null
        }
        Insert: {
          amount?: number | null
          calculation_type?: string
          cost_id: number
          currency?: string
          fabric_name?: string | null
          id?: number
          item_type?: string
          name: string
          quantity?: number | null
          sort_order?: number
          unit_price?: number | null
        }
        Update: {
          amount?: number | null
          calculation_type?: string
          cost_id?: number
          currency?: string
          fabric_name?: string | null
          id?: number
          item_type?: string
          name?: string
          quantity?: number | null
          sort_order?: number
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_cost_items_cost_id_fkey"
            columns: ["cost_id"]
            isOneToOne: false
            referencedRelation: "product_costs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_costs: {
        Row: {
          created_at: string
          created_by: string | null
          currency_display: string
          id: number
          is_current: boolean
          notes: string | null
          product_id: number
          rate_snapshot: Json
          total_cost_try: number
          total_cost_usd: number
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency_display?: string
          id?: number
          is_current?: boolean
          notes?: string | null
          product_id: number
          rate_snapshot?: Json
          total_cost_try?: number
          total_cost_usd?: number
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency_display?: string
          id?: number
          is_current?: boolean
          notes?: string | null
          product_id?: number
          rate_snapshot?: Json
          total_cost_try?: number
          total_cost_usd?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
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
          follow_up_at: string | null
          follow_up_reason: string | null
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
          follow_up_at?: string | null
          follow_up_reason?: string | null
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
          follow_up_at?: string | null
          follow_up_reason?: string | null
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
          overdue_warned_at: string | null
          quote_id: number | null
          received_at: string | null
          rejection_reason: string | null
          revision_of_sample_id: number | null
          revision_reason: string | null
          revision_round: number
          shipped_at: string | null
          status_id: number | null
          target_date: string | null
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
          overdue_warned_at?: string | null
          quote_id?: number | null
          received_at?: string | null
          rejection_reason?: string | null
          revision_of_sample_id?: number | null
          revision_reason?: string | null
          revision_round?: number
          shipped_at?: string | null
          status_id?: number | null
          target_date?: string | null
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
          overdue_warned_at?: string | null
          quote_id?: number | null
          received_at?: string | null
          rejection_reason?: string | null
          revision_of_sample_id?: number | null
          revision_reason?: string | null
          revision_round?: number
          shipped_at?: string | null
          status_id?: number | null
          target_date?: string | null
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
      task_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          assigned_to: string | null
          id: number
          reason: string | null
          task_id: number
          unassigned_at: string | null
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          assigned_to?: string | null
          id?: never
          reason?: string | null
          task_id: number
          unassigned_at?: string | null
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          assigned_to?: string | null
          id?: never
          reason?: string | null
          task_id?: number
          unassigned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          created_at: string
          dependency_type: string
          depends_on_task_id: number
          id: number
          task_id: number
        }
        Insert: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id: number
          id?: never
          task_id: number
        }
        Update: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id?: number
          id?: never
          task_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_priorities: {
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
          weight: number
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
          weight?: number
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
          weight?: number
        }
        Relationships: []
      }
      task_statuses: {
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
      task_suggestion_state: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          kind: string
          operation_id: number
          reason: string | null
          ref_id: number
          state: string
          task_id: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          kind: string
          operation_id: number
          reason?: string | null
          ref_id: number
          state: string
          task_id?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          kind?: string
          operation_id?: number
          reason?: string | null
          ref_id?: number
          state?: string
          task_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_suggestion_state_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_suggestion_state_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_suggestion_state_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          assignee_team_id: number | null
          assignee_user_id: string | null
          created_at: string
          default_assignee_rule: string
          default_priority_id: number | null
          description_template: string | null
          due_offset_hours: number
          id: number
          is_active: boolean
          sort_order: number
          title_template: string
          trigger_event: string
          updated_at: string
        }
        Insert: {
          assignee_team_id?: number | null
          assignee_user_id?: string | null
          created_at?: string
          default_assignee_rule?: string
          default_priority_id?: number | null
          description_template?: string | null
          due_offset_hours?: number
          id?: never
          is_active?: boolean
          sort_order?: number
          title_template: string
          trigger_event: string
          updated_at?: string
        }
        Update: {
          assignee_team_id?: number | null
          assignee_user_id?: string | null
          created_at?: string
          default_assignee_rule?: string
          default_priority_id?: number | null
          description_template?: string | null
          due_offset_hours?: number
          id?: never
          is_active?: boolean
          sort_order?: number
          title_template?: string
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_assignee_team_id_fkey"
            columns: ["assignee_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_assignee_user_id_fkey"
            columns: ["assignee_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_default_priority_id_fkey"
            columns: ["default_priority_id"]
            isOneToOne: false
            referencedRelation: "task_priorities"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_team_id: number | null
          assigned_to: string | null
          auto_kind: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_at: string | null
          due_warned_at: string | null
          entity_id: number | null
          entity_type: string | null
          estimated_hours: number | null
          id: number
          overdue_notified_at: string | null
          parent_task_id: number | null
          priority_id: number | null
          sort_order: number
          source: string
          started_at: string | null
          status_id: number | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_team_id?: number | null
          assigned_to?: string | null
          auto_kind?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_at?: string | null
          due_warned_at?: string | null
          entity_id?: number | null
          entity_type?: string | null
          estimated_hours?: number | null
          id?: never
          overdue_notified_at?: string | null
          parent_task_id?: number | null
          priority_id?: number | null
          sort_order?: number
          source?: string
          started_at?: string | null
          status_id?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_team_id?: number | null
          assigned_to?: string | null
          auto_kind?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_at?: string | null
          due_warned_at?: string | null
          entity_id?: number | null
          entity_type?: string | null
          estimated_hours?: number | null
          id?: never
          overdue_notified_at?: string | null
          parent_task_id?: number | null
          priority_id?: number | null
          sort_order?: number
          source?: string
          started_at?: string | null
          status_id?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_team_id_fkey"
            columns: ["assigned_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_priority_id_fkey"
            columns: ["priority_id"]
            isOneToOne: false
            referencedRelation: "task_priorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "task_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: number
          joined_at: string
          team_id: number
          user_id: string
        }
        Insert: {
          id?: never
          joined_at?: string
          team_id: number
          user_id: string
        }
        Update: {
          id?: never
          joined_at?: string
          team_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          code: string | null
          created_at: string
          department_id: number | null
          id: number
          is_active: boolean
          lead_user_id: string | null
          name: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          department_id?: number | null
          id?: never
          is_active?: boolean
          lead_user_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          department_id?: number | null
          id?: never
          is_active?: boolean
          lead_user_id?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_lead_user_id_fkey"
            columns: ["lead_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
      workflow_steps: {
        Row: {
          assignee_user_id: string | null
          default_assignee_rule: string
          default_priority_id: number | null
          description_template: string | null
          due_offset_hours: number
          id: number
          sort_order: number
          title_template: string
          workflow_id: number
        }
        Insert: {
          assignee_user_id?: string | null
          default_assignee_rule?: string
          default_priority_id?: number | null
          description_template?: string | null
          due_offset_hours?: number
          id?: never
          sort_order?: number
          title_template: string
          workflow_id: number
        }
        Update: {
          assignee_user_id?: string | null
          default_assignee_rule?: string
          default_priority_id?: number | null
          description_template?: string | null
          due_offset_hours?: number
          id?: never
          sort_order?: number
          title_template?: string
          workflow_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_assignee_user_id_fkey"
            columns: ["assignee_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_default_priority_id_fkey"
            columns: ["default_priority_id"]
            isOneToOne: false
            referencedRelation: "task_priorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          name: string
          trigger_event: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_active?: boolean
          name: string
          trigger_event: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          is_active?: boolean
          name?: string
          trigger_event?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _auto_task_upsert: {
        Args: {
          p_assigned_to: string
          p_auto_kind: string
          p_due_at: string
          p_entity_id: number
          p_entity_type: string
          p_title: string
        }
        Returns: undefined
      }
      accept_task_suggestion: {
        Args: {
          p_assigned_to: string
          p_description: string
          p_due_at: string
          p_kind: string
          p_operation_id: number
          p_priority_id: number
          p_ref_id: number
          p_title: string
        }
        Returns: number
      }
      add_working_hours: {
        Args: { p_from: string; p_hours: number }
        Returns: string
      }
      advance_override: {
        Args: { p_order_id: number; p_reason: string }
        Returns: Json
      }
      ai_calls_today: { Args: never; Returns: number }
      ai_cost_month: { Args: never; Returns: number }
      ai_cost_today: { Args: never; Returns: number }
      ai_feature_calls_today: { Args: { p_feature: string }; Returns: number }
      ai_spend_summary: { Args: never; Returns: Json }
      alert_manager_recipients: { Args: never; Returns: string[] }
      alert_pool_recipients: { Args: never; Returns: string[] }
      app_timezone: { Args: never; Returns: string }
      approve_draft_quote: { Args: { p_document_id: number }; Returns: number }
      build_document_data: {
        Args: { p_language?: string; p_operation_id: number; p_type: string }
        Returns: Json
      }
      build_draft_quote: { Args: { p_operation_id: number }; Returns: number }
      cache_historical_rate: {
        Args: { p_currency: string; p_date: string; p_rate: number }
        Returns: undefined
      }
      catalog_code_key: { Args: { input: string }; Returns: string }
      catalog_slugify: { Args: { input: string }; Returns: string }
      check_import_duplicates: {
        Args: { p_rows: Json }
        Returns: {
          idx: number
          matched: boolean
          reason: string
        }[]
      }
      claim_operation: { Args: { p_operation_id: number }; Returns: Json }
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
      create_catalog_product_and_link: {
        Args: {
          p_code: string
          p_collection_id?: number
          p_item_id: number
          p_name: string
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
      current_rates: { Args: never; Returns: Json }
      customer_archive: { Args: { p_customer_id: number }; Returns: undefined }
      customer_balance: {
        Args: { p_as_of?: string; p_customer_id: number }
        Returns: {
          balance_try: number
          balance_usd: number
          last_transaction_at: string
        }[]
      }
      customer_delete_preview: {
        Args: { p_customer_id: number }
        Returns: Json
      }
      customer_hard_delete: { Args: { p_customer_id: number }; Returns: Json }
      customer_summary: { Args: { p_customer_id: number }; Returns: Json }
      customer_unarchive: {
        Args: { p_customer_id: number }
        Returns: undefined
      }
      daily_summary: { Args: never; Returns: Json }
      dismiss_merge: { Args: { p_operation: number }; Returns: undefined }
      dismiss_task_suggestion: {
        Args: {
          p_kind: string
          p_operation_id: number
          p_reason: string
          p_ref_id: number
        }
        Returns: undefined
      }
      document_uretici: { Args: never; Returns: Json }
      due_payments: {
        Args: never
        Returns: {
          amount_usd: number
          customer_id: number
          customer_name: string
          days_left: number
          due_date: string
          due_kind: string
          operation_code: string
          operation_id: number
          order_id: number
          sufficient: boolean
        }[]
      }
      due_quote_followups: {
        Args: never
        Returns: {
          follow_up_at: string
          operation_id: number
          quote_id: number
          reason: string
        }[]
      }
      evaluate_order_due: { Args: { p_order_id: number }; Returns: number }
      file_record_exists: {
        Args: { p_bucket: string; p_path: string }
        Returns: boolean
      }
      finance_customer_visible: {
        Args: { p_customer_id: number }
        Returns: boolean
      }
      finance_scope_all: { Args: never; Returns: boolean }
      finance_summary: { Args: never; Returns: Json }
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
      goal_actual: { Args: { p_goal_id: number }; Returns: number }
      has_permission: { Args: { permission_key: string }; Returns: boolean }
      intake_normalize_phone: { Args: { p_raw: string }; Returns: string }
      intake_process: { Args: { p: Json }; Returns: Json }
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
      manager_interventions: { Args: never; Returns: Json }
      manager_pending_quotes: { Args: { p_limit?: number }; Returns: Json }
      manager_pending_requests: { Args: { p_limit?: number }; Returns: Json }
      merge_operations: {
        Args: { p_source: number; p_target: number }
        Returns: undefined
      }
      metric_active_funnel: { Args: never; Returns: Json }
      metric_employees: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      metric_finance: { Args: { p_from: string; p_to: string }; Returns: Json }
      metric_funnel: {
        Args: { p_from: string; p_scope_user?: string; p_to: string }
        Returns: Json
      }
      metric_interactions: {
        Args: {
          p_channel?: number
          p_from: string
          p_scope_user?: string
          p_to: string
        }
        Returns: Json
      }
      metric_leads: { Args: { p_from: string; p_to: string }; Returns: Json }
      metric_orders: { Args: { p_from: string; p_to: string }; Returns: Json }
      metric_pipeline: {
        Args: { p_from: string; p_scope_user?: string; p_to: string }
        Returns: Json
      }
      metric_quotes: {
        Args: { p_from: string; p_scope_user?: string; p_to: string }
        Returns: Json
      }
      metric_request_trend: {
        Args: { p_from: string; p_scope_user?: string; p_to: string }
        Returns: Json
      }
      metric_requests: {
        Args: {
          p_category?: number
          p_channel?: number
          p_from: string
          p_province?: number
          p_scope_user?: string
          p_to: string
        }
        Returns: Json
      }
      metric_samples: { Args: { p_from: string; p_to: string }; Returns: Json }
      metric_stage_durations: {
        Args: { p_from: string; p_to: string }
        Returns: Json
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
      notify_payment: {
        Args: {
          p_body: string
          p_code: string
          p_op: number
          p_owner: string
          p_sev: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      of_close: {
        Args: { p_op: number; p_reason: string; p_type: string }
        Returns: undefined
      }
      of_hours: { Args: { p_default: number; p_key: string }; Returns: number }
      of_open: {
        Args: { p_due: string; p_op: number; p_type: string }
        Returns: undefined
      }
      op_advance_stage: {
        Args: { p_operation_id: number; p_target_key: string }
        Returns: undefined
      }
      op_set_stage: {
        Args: { p_operation_id: number; p_target_key: string }
        Returns: undefined
      }
      open_balances: {
        Args: never
        Returns: {
          balance_try: number
          balance_usd: number
          customer_id: number
          customer_name: string
          last_at: string
        }[]
      }
      open_file_level: {
        Args: {
          p_due: string
          p_escalate_hours: number
          p_file_type: string
          p_now: string
          p_opened: string
          p_urgent: number
          p_warn: number
        }
        Returns: number
      }
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
      operation_task_suggestions: {
        Args: { p_operation_id: number }
        Returns: {
          assignee_rule: string
          description: string
          due_offset_hours: number
          priority_id: number
          resolved_assignee: string
          template_id: number
          title: string
          trigger_event: string
        }[]
      }
      operation_workflow_suggestions: {
        Args: { p_operation_id: number }
        Returns: {
          assignee_rule: string
          description: string
          due_offset_hours: number
          priority_id: number
          resolved_assignee: string
          step_id: number
          title: string
          trigger_event: string
          workflow_name: string
        }[]
      }
      order_advance_check: { Args: { p_order_id: number }; Returns: Json }
      order_paid_summary: { Args: { p_order_id: number }; Returns: Json }
      post_account_transaction: {
        Args: {
          p_amount: number
          p_created_by?: string
          p_currency: string
          p_customer_id: number
          p_description?: string
          p_direction: string
          p_exchange_rate?: number
          p_occurred_at?: string
          p_operation_id?: number
          p_reverses_id?: number
          p_source_id?: number
          p_source_type: string
          p_usd_rate?: number
        }
        Returns: number
      }
      process_delivery_warnings: { Args: never; Returns: number }
      process_goal_notifications: { Args: never; Returns: number }
      process_open_file_alerts: { Args: never; Returns: number }
      process_payment_due_warnings: { Args: never; Returns: number }
      process_quote_final_hour: { Args: never; Returns: number }
      process_sample_due_warnings: { Args: never; Returns: number }
      process_task_due_warnings: { Args: never; Returns: number }
      product_price: {
        Args: { p_product_id: number; p_quantity: number }
        Returns: Json
      }
      quote_default_tax_rate: { Args: never; Returns: number }
      quote_default_validity_days: { Args: never; Returns: number }
      rate_on_date: {
        Args: { p_currency: string; p_date: string }
        Returns: number
      }
      rate_to_try: { Args: { p_currency: string }; Returns: number }
      recompute_order_totals: {
        Args: { p_order_id: number }
        Returns: undefined
      }
      recompute_quote_totals: {
        Args: { p_quote_id: number }
        Returns: undefined
      }
      report_permission_matrix: { Args: never; Returns: Json }
      require_siparis_onay: {
        Args: { p_operation_id: number }
        Returns: undefined
      }
      resolve_alert_recipients: {
        Args: { p_assigned: string; p_file_type: string; p_level: number }
        Returns: string[]
      }
      resolve_catalog_item: {
        Args: { p_item_id: number; p_product_id: number }
        Returns: undefined
      }
      reverse_account_transaction: {
        Args: { p_id: number; p_reason: string }
        Returns: number
      }
      revise_sample: {
        Args: { p_reason: string; p_sample_id: number }
        Returns: number
      }
      save_product_cost: {
        Args: {
          p_items: Json
          p_notes: string
          p_product_id: number
          p_rates: Json
          p_total_try: number
          p_total_usd: number
        }
        Returns: number
      }
      set_exchange_rate: {
        Args: { p_currency: string; p_rate: number; p_source?: string }
        Returns: undefined
      }
      set_role_permission: {
        Args: { p_granted: boolean; p_perm_key: string; p_role_key: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sla_sweep: { Args: never; Returns: number }
      snooze_open_file: {
        Args: { p_open_file_id: number; p_reason: string; p_until: string }
        Returns: Json
      }
      suggest_catalog_products: {
        Args: { p_code: string; p_limit?: number }
        Returns: {
          code: string
          id: number
          name: string
        }[]
      }
      task_blocking: {
        Args: { p_task_id: number }
        Returns: {
          depends_on_task_id: number
          status_key: string
          title: string
        }[]
      }
      task_subtree_progress: { Args: { p_task_id: number }; Returns: number }
      undo_import_batch: { Args: { p_batch_id: number }; Returns: Json }
      user_workload: {
        Args: { p_user_id: string }
        Returns: {
          estimated_hours: number
          open_count: number
        }[]
      }
    }
    Enums: {
      audit_action: "insert" | "update" | "delete" | "restore"
      audit_source:
        | "user"
        | "system"
        | "automation"
        | "migration"
        | "import"
        | "rpc"
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
  public: {
    Enums: {
      audit_action: ["insert", "update", "delete", "restore"],
      audit_source: [
        "user",
        "system",
        "automation",
        "migration",
        "import",
        "rpc",
      ],
      file_category: ["document", "image", "avatar", "export", "other"],
    },
  },
} as const
