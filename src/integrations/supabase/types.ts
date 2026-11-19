// Tipos gerados do banco Supabase (supabase gen types typescript).
// NÃO editar à mão: regenerar após migrations.

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
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          project_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_credit_costs: {
        Row: {
          created_at: string
          credits: number
          description: string | null
          operation: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits: number
          description?: string | null
          operation: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits?: number
          description?: string | null
          operation?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_electrical_config: {
        Row: {
          config_key: string
          config_value: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          config_key: string
          config_value: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          config_key?: string
          config_value?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_fix_audit: {
        Row: {
          after_state: Json
          ai_model: string
          applied_by_user: boolean
          before_state: Json
          clause: string
          created_at: string
          diagnostic_id: string
          id: string
          project_id: string
          proposal_id: string
          rationale_pt: string
          reverts_audit_id: string | null
          rule_id: string
          standard: string
          undone_at: string | null
          user_action: string
          user_id: string
        }
        Insert: {
          after_state: Json
          ai_model: string
          applied_by_user?: boolean
          before_state: Json
          clause: string
          created_at?: string
          diagnostic_id: string
          id?: string
          project_id: string
          proposal_id: string
          rationale_pt: string
          reverts_audit_id?: string | null
          rule_id: string
          standard: string
          undone_at?: string | null
          user_action: string
          user_id: string
        }
        Update: {
          after_state?: Json
          ai_model?: string
          applied_by_user?: boolean
          before_state?: Json
          clause?: string
          created_at?: string
          diagnostic_id?: string
          id?: string
          project_id?: string
          proposal_id?: string
          rationale_pt?: string
          reverts_audit_id?: string | null
          rule_id?: string
          standard?: string
          undone_at?: string | null
          user_action?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_fix_audit_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_fix_audit_reverts_audit_id_fkey"
            columns: ["reverts_audit_id"]
            isOneToOne: false
            referencedRelation: "ai_fix_audit"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          tokens_used: number | null
          tool_calls: Json | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tokens_used?: number | null
          tool_calls?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tokens_used?: number | null
          tool_calls?: Json | null
        }
        Relationships: []
      }
      ai_rate_limit_configs: {
        Row: {
          burst_max: number
          burst_window_ms: number
          created_at: string
          fallback_max: number
          fallback_window_ms: number
          id: string
          note: string | null
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          burst_max?: number
          burst_window_ms?: number
          created_at?: string
          fallback_max?: number
          fallback_window_ms?: number
          id?: string
          note?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          burst_max?: number
          burst_window_ms?: number
          created_at?: string
          fallback_max?: number
          fallback_window_ms?: number
          id?: string
          note?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_status_events: {
        Row: {
          code: string | null
          created_at: string
          id: string
          latency_ms: number
          ok: boolean
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          latency_ms?: number
          ok: boolean
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          latency_ms?: number
          ok?: boolean
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ai_usage_events: {
        Row: {
          created_at: string
          credits: number
          id: string
          operation: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits: number
          id?: string
          operation: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          operation?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      alarm_configs: {
        Row: {
          area: string
          auto_clear: boolean
          category: Database["public"]["Enums"]["alarm_category"]
          created_at: string
          deadband: number | null
          delay_ms: number
          description: string
          equipment_type: string
          high_high_limit: number | null
          high_limit: number | null
          id: string
          location: string
          low_limit: number | null
          low_low_limit: number | null
          notify_on_ack: boolean
          notify_on_clear: boolean
          notify_on_trigger: boolean
          project_id: string
          require_acknowledgment: boolean
          severity: Database["public"]["Enums"]["alarm_severity"]
          suppressible: boolean
          tag_name: string
          updated_at: string
        }
        Insert: {
          area: string
          auto_clear?: boolean
          category: Database["public"]["Enums"]["alarm_category"]
          created_at?: string
          deadband?: number | null
          delay_ms: number
          description: string
          equipment_type: string
          high_high_limit?: number | null
          high_limit?: number | null
          id?: string
          location: string
          low_limit?: number | null
          low_low_limit?: number | null
          notify_on_ack?: boolean
          notify_on_clear?: boolean
          notify_on_trigger?: boolean
          project_id: string
          require_acknowledgment?: boolean
          severity: Database["public"]["Enums"]["alarm_severity"]
          suppressible?: boolean
          tag_name: string
          updated_at?: string
        }
        Update: {
          area?: string
          auto_clear?: boolean
          category?: Database["public"]["Enums"]["alarm_category"]
          created_at?: string
          deadband?: number | null
          delay_ms?: number
          description?: string
          equipment_type?: string
          high_high_limit?: number | null
          high_limit?: number | null
          id?: string
          location?: string
          low_limit?: number | null
          low_low_limit?: number | null
          notify_on_ack?: boolean
          notify_on_clear?: boolean
          notify_on_trigger?: boolean
          project_id?: string
          require_acknowledgment?: boolean
          severity?: Database["public"]["Enums"]["alarm_severity"]
          suppressible?: boolean
          tag_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      alarm_history: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alarm_config_id: string | null
          area: string
          category: Database["public"]["Enums"]["alarm_category"]
          cleared_at: string | null
          cleared_by: string | null
          description: string
          equipment_type: string
          id: string
          location: string
          message: string | null
          occurrence_id: string | null
          operator_note: string | null
          project_id: string
          setpoint: number | null
          severity: Database["public"]["Enums"]["alarm_severity"]
          source: string | null
          state: Database["public"]["Enums"]["alarm_state"]
          tag_name: string
          triggered_at: string
          updated_at: string
          value: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alarm_config_id?: string | null
          area: string
          category: Database["public"]["Enums"]["alarm_category"]
          cleared_at?: string | null
          cleared_by?: string | null
          description: string
          equipment_type: string
          id?: string
          location: string
          message?: string | null
          occurrence_id?: string | null
          operator_note?: string | null
          project_id: string
          setpoint?: number | null
          severity: Database["public"]["Enums"]["alarm_severity"]
          source?: string | null
          state: Database["public"]["Enums"]["alarm_state"]
          tag_name: string
          triggered_at: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alarm_config_id?: string | null
          area?: string
          category?: Database["public"]["Enums"]["alarm_category"]
          cleared_at?: string | null
          cleared_by?: string | null
          description?: string
          equipment_type?: string
          id?: string
          location?: string
          message?: string | null
          occurrence_id?: string | null
          operator_note?: string | null
          project_id?: string
          setpoint?: number | null
          severity?: Database["public"]["Enums"]["alarm_severity"]
          source?: string | null
          state?: Database["public"]["Enums"]["alarm_state"]
          tag_name?: string
          triggered_at?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: []
      }
      alarm_point_settings: {
        Row: {
          cause: string | null
          consequence: string | null
          corrective_action: string | null
          created_at: string
          id: string
          oos_at: string | null
          oos_by: string | null
          oos_reason: string | null
          out_of_service: boolean
          point_key: string
          project_id: string
          rationalized_at: string | null
          rationalized_by: string | null
          response_time_min: number | null
          shelve_reason: string | null
          shelved_at: string | null
          shelved_by: string | null
          shelved_until: string | null
          tag_name: string
          updated_at: string
        }
        Insert: {
          cause?: string | null
          consequence?: string | null
          corrective_action?: string | null
          created_at?: string
          id?: string
          oos_at?: string | null
          oos_by?: string | null
          oos_reason?: string | null
          out_of_service?: boolean
          point_key: string
          project_id: string
          rationalized_at?: string | null
          rationalized_by?: string | null
          response_time_min?: number | null
          shelve_reason?: string | null
          shelved_at?: string | null
          shelved_by?: string | null
          shelved_until?: string | null
          tag_name: string
          updated_at?: string
        }
        Update: {
          cause?: string | null
          consequence?: string | null
          corrective_action?: string | null
          created_at?: string
          id?: string
          oos_at?: string | null
          oos_by?: string | null
          oos_reason?: string | null
          out_of_service?: boolean
          point_key?: string
          project_id?: string
          rationalized_at?: string | null
          rationalized_by?: string | null
          response_time_min?: number | null
          shelve_reason?: string | null
          shelved_at?: string | null
          shelved_by?: string | null
          shelved_until?: string | null
          tag_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alarm_point_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          key_hash: string
          last_used_at: string | null
          name: string
          prefix: string
          scopes: string[]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          last_used_at?: string | null
          name: string
          prefix: string
          scopes?: string[]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          scopes?: string[]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          chain_hash: string
          created_at: string
          details: Json | null
          id: string
          ip_address: unknown
          previous_hash: string | null
          resource_id: string | null
          resource_type: string
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          chain_hash: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          previous_hash?: string | null
          resource_id?: string | null
          resource_type: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          chain_hash?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          previous_hash?: string | null
          resource_id?: string | null
          resource_type?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      billing_events: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          event_type: string
          id: string
          stripe_event_id: string | null
          stripe_invoice_id: string | null
          tenant_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type: string
          id?: string
          stripe_event_id?: string | null
          stripe_invoice_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type?: string
          id?: string
          stripe_event_id?: string | null
          stripe_invoice_id?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      blog_categories: {
        Row: {
          id: string
          name: Json
          slug: string
        }
        Insert: {
          id?: string
          name?: Json
          slug: string
        }
        Update: {
          id?: string
          name?: Json
          slug?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author_id: string | null
          category_id: string | null
          content: Json
          cover_image: string | null
          created_at: string
          excerpt: string | null
          id: string
          published_at: string | null
          seo_metadata: Json | null
          slug: string
          status: string
          title: Json
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          category_id?: string | null
          content?: Json
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          seo_metadata?: Json | null
          slug: string
          status: string
          title?: Json
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          category_id?: string | null
          content?: Json
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          seo_metadata?: Json | null
          slug?: string
          status?: string
          title?: Json
          updated_at?: string
        }
        Relationships: []
      }
      calculations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          inputs: Json
          project_id: string
          results: Json
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          inputs?: Json
          project_id: string
          results?: Json
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          inputs?: Json
          project_id?: string
          results?: Json
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalog_component_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: []
      }
      catalog_components: {
        Row: {
          category_id: string
          certifications: string[] | null
          commercial_name: string | null
          created_at: string
          datasheet_url: string | null
          description: string | null
          discontinued: boolean
          embedding: string | null
          etim_class: string | null
          id: string
          image_urls: string[] | null
          keywords: string[]
          list_price_brl: number | null
          manufacturer_id: string
          part_number: string
          rated_current_a: number | null
          rated_voltage_v: number | null
          specs: Json
          updated_at: string
        }
        Insert: {
          category_id: string
          certifications?: string[] | null
          commercial_name?: string | null
          created_at?: string
          datasheet_url?: string | null
          description?: string | null
          discontinued?: boolean
          embedding?: string | null
          etim_class?: string | null
          id?: string
          image_urls?: string[] | null
          keywords?: string[]
          list_price_brl?: number | null
          manufacturer_id: string
          part_number: string
          rated_current_a?: number | null
          rated_voltage_v?: number | null
          specs?: Json
          updated_at?: string
        }
        Update: {
          category_id?: string
          certifications?: string[] | null
          commercial_name?: string | null
          created_at?: string
          datasheet_url?: string | null
          description?: string | null
          discontinued?: boolean
          embedding?: string | null
          etim_class?: string | null
          id?: string
          image_urls?: string[] | null
          keywords?: string[]
          list_price_brl?: number | null
          manufacturer_id?: string
          part_number?: string
          rated_current_a?: number | null
          rated_voltage_v?: number | null
          specs?: Json
          updated_at?: string
        }
        Relationships: []
      }
      catalog_manufacturers: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          website: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          website?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          website?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string
          cnpj: string
          contact_name: string
          created_at: string
          created_by: string
          email: string
          id: string
          logo_url: string | null
          name: string
          notes: string
          phone: string
          sector: string
          sla_pct: number
          status: Database["public"]["Enums"]["client_status"]
          tenant_id: string
          updated_at: string
          website: string
        }
        Insert: {
          address?: string
          cnpj?: string
          contact_name?: string
          created_at?: string
          created_by: string
          email?: string
          id?: string
          logo_url?: string | null
          name: string
          notes?: string
          phone?: string
          sector?: string
          sla_pct?: number
          status?: Database["public"]["Enums"]["client_status"]
          tenant_id: string
          updated_at?: string
          website?: string
        }
        Update: {
          address?: string
          cnpj?: string
          contact_name?: string
          created_at?: string
          created_by?: string
          email?: string
          id?: string
          logo_url?: string | null
          name?: string
          notes?: string
          phone?: string
          sector?: string
          sla_pct?: number
          status?: Database["public"]["Enums"]["client_status"]
          tenant_id?: string
          updated_at?: string
          website?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          parent_id: string | null
          resource_id: string
          resource_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          parent_id?: string | null
          resource_id: string
          resource_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          resource_id?: string
          resource_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      compact_studio_device_audit: {
        Row: {
          action: string
          actor_role: string
          actor_user_id: string
          created_at: string
          details_json: Json
          id: string
          outcome: string
          project_id: string
          protocol: string
          target_endpoint: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_role: string
          actor_user_id: string
          created_at?: string
          details_json?: Json
          id?: string
          outcome: string
          project_id: string
          protocol: string
          target_endpoint: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_role?: string
          actor_user_id?: string
          created_at?: string
          details_json?: Json
          id?: string
          outcome?: string
          project_id?: string
          protocol?: string
          target_endpoint?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compact_studio_device_audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      compact_studio_libraries: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          payload_json: Json
          tenant_id: string
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          payload_json: Json
          tenant_id: string
          updated_at?: string
          version: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          payload_json?: Json
          tenant_id?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "compact_studio_libraries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_requests: {
        Row: {
          id: string
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      diagrams: {
        Row: {
          canvas_data: Json
          created_at: string
          id: string
          name: string
          project_id: string
          updated_at: string
          version: number
        }
        Insert: {
          canvas_data?: Json
          created_at?: string
          id?: string
          name: string
          project_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          canvas_data?: Json
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "diagrams_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_ingested_dedup: {
        Row: {
          dedup_key: string
          gateway_id: string
          ingested_at: string
          plant_id: string
          sample_json: Json
          source_timestamp: number
          tag_name: string
          tenant_id: string | null
        }
        Insert: {
          dedup_key: string
          gateway_id: string
          ingested_at?: string
          plant_id: string
          sample_json: Json
          source_timestamp: number
          tag_name: string
          tenant_id?: string | null
        }
        Update: {
          dedup_key?: string
          gateway_id?: string
          ingested_at?: string
          plant_id?: string
          sample_json?: Json
          source_timestamp?: number
          tag_name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edge_ingested_dedup_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      electrical_components: {
        Row: {
          category: string
          created_at: string
          datasheet_url: string | null
          id: string
          manufacturer: string
          model: string
          specifications: Json
          symbol_svg: string | null
        }
        Insert: {
          category: string
          created_at?: string
          datasheet_url?: string | null
          id?: string
          manufacturer: string
          model: string
          specifications?: Json
          symbol_svg?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          datasheet_url?: string | null
          id?: string
          manufacturer?: string
          model?: string
          specifications?: Json
          symbol_svg?: string | null
        }
        Relationships: []
      }
      electrical_simulation_results: {
        Row: {
          computation_time_ms: number | null
          created_at: string
          created_by: string | null
          errors: Json | null
          id: string
          input_data: Json
          project_id: string
          results: Json
          simulation_type: string
          software_version: string | null
          standard: string
          warnings: Json | null
        }
        Insert: {
          computation_time_ms?: number | null
          created_at?: string
          created_by?: string | null
          errors?: Json | null
          id?: string
          input_data: Json
          project_id: string
          results: Json
          simulation_type: string
          software_version?: string | null
          standard: string
          warnings?: Json | null
        }
        Update: {
          computation_time_ms?: number | null
          created_at?: string
          created_by?: string | null
          errors?: Json | null
          id?: string
          input_data?: Json
          project_id?: string
          results?: Json
          simulation_type?: string
          software_version?: string | null
          standard?: string
          warnings?: Json | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          key: string
          tenant_ids: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          tenant_ids?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          tenant_ids?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      file_versions: {
        Row: {
          created_at: string
          created_by: string
          file_id: string
          id: string
          storage_path: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by: string
          file_id: string
          id?: string
          storage_path: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string
          file_id?: string
          id?: string
          storage_path?: string
          version_number?: number
        }
        Relationships: []
      }
      files: {
        Row: {
          created_at: string
          id: string
          mime_type: string | null
          name: string
          project_id: string
          size_bytes: number | null
          storage_path: string
          tenant_id: string
          updated_at: string
          uploaded_by: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type?: string | null
          name: string
          project_id: string
          size_bytes?: number | null
          storage_path: string
          tenant_id: string
          updated_at?: string
          uploaded_by: string
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string | null
          name?: string
          project_id?: string
          size_bytes?: number | null
          storage_path?: string
          tenant_id?: string
          updated_at?: string
          uploaded_by?: string
          version?: number
        }
        Relationships: []
      }
      fleet_audit_chain: {
        Row: {
          event_json: Json
          event_timestamp: number
          event_type: string
          gateway_id: string
          id: string
          organization_id: string
          plant_id: string
          previous_hash: string
          result: string
          schema_version: string
          seq: number
          severity: string
          tamper_proof_hash: string
          tenant_id: string | null
        }
        Insert: {
          event_json: Json
          event_timestamp: number
          event_type: string
          gateway_id: string
          id: string
          organization_id: string
          plant_id: string
          previous_hash: string
          result: string
          schema_version?: string
          seq?: number
          severity: string
          tamper_proof_hash: string
          tenant_id?: string | null
        }
        Update: {
          event_json?: Json
          event_timestamp?: number
          event_type?: string
          gateway_id?: string
          id?: string
          organization_id?: string
          plant_id?: string
          previous_hash?: string
          result?: string
          schema_version?: string
          seq?: number
          severity?: string
          tamper_proof_hash?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_audit_chain_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_gateways: {
        Row: {
          gateway_id: string
          organization_id: string
          payload_json: Json
          plant_id: string
          record_version: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          gateway_id: string
          organization_id: string
          payload_json: Json
          plant_id: string
          record_version?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          gateway_id?: string
          organization_id?: string
          payload_json?: Json
          plant_id?: string
          record_version?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_gateways_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_latest_telemetry: {
        Row: {
          gateway_id: string
          organization_id: string
          sample_json: Json
          source_timestamp: number
          tag_name: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          gateway_id: string
          organization_id: string
          sample_json: Json
          source_timestamp: number
          tag_name: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          gateway_id?: string
          organization_id?: string
          sample_json?: Json
          source_timestamp?: number
          tag_name?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_latest_telemetry_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_registered_gateways: {
        Row: {
          auth_token_digest: string | null
          authorized_endpoints: string[]
          gateway_id: string
          last_batch_sequence: number
          organization_id: string
          payload_json: Json
          plant_id: string
          record_version: number
          station_id: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          auth_token_digest?: string | null
          authorized_endpoints?: string[]
          gateway_id: string
          last_batch_sequence?: number
          organization_id: string
          payload_json: Json
          plant_id: string
          record_version?: number
          station_id: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          auth_token_digest?: string | null
          authorized_endpoints?: string[]
          gateway_id?: string
          last_batch_sequence?: number
          organization_id?: string
          payload_json?: Json
          plant_id?: string
          record_version?: number
          station_id?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_registered_gateways_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      function_block_instances: {
        Row: {
          created_at: string
          id: string
          instance_name: string
          pin_bindings: Json
          project_id: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_name: string
          pin_bindings?: Json
          project_id: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_name?: string
          pin_bindings?: Json
          project_id?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      gateway_certificate_challenges: {
        Row: {
          challenge_key: string
          consumed_at: string
          expires_at: string
          gateway_id: string
        }
        Insert: {
          challenge_key: string
          consumed_at?: string
          expires_at: string
          gateway_id: string
        }
        Update: {
          challenge_key?: string
          consumed_at?: string
          expires_at?: string
          gateway_id?: string
        }
        Relationships: []
      }
      gateway_certificates: {
        Row: {
          cert_json: Json
          gateway_id: string
          pop_public_key: string | null
          record_version: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          cert_json: Json
          gateway_id: string
          pop_public_key?: string | null
          record_version?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          cert_json?: Json
          gateway_id?: string
          pop_public_key?: string | null
          record_version?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_certificates_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: true
            referencedRelation: "fleet_registered_gateways"
            referencedColumns: ["gateway_id"]
          },
          {
            foreignKeyName: "gateway_certificates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      industrial_alarm_definitions: {
        Row: {
          condition_type: string
          created_at: string
          deadband: number
          equipment_id: string | null
          id: string
          name: string
          plant_id: string
          priority: number
          severity: string
          tag_id: string
          tenant_id: string
          threshold: number | null
        }
        Insert: {
          condition_type: string
          created_at?: string
          deadband?: number
          equipment_id?: string | null
          id: string
          name: string
          plant_id: string
          priority: number
          severity: string
          tag_id: string
          tenant_id: string
          threshold?: number | null
        }
        Update: {
          condition_type?: string
          created_at?: string
          deadband?: number
          equipment_id?: string | null
          id?: string
          name?: string
          plant_id?: string
          priority?: number
          severity?: string
          tag_id?: string
          tenant_id?: string
          threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "industrial_alarm_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industrial_alarm_definitions_tenant_id_plant_id_tag_id_fkey"
            columns: ["tenant_id", "plant_id", "tag_id"]
            isOneToOne: false
            referencedRelation: "industrial_tags"
            referencedColumns: ["tenant_id", "plant_id", "tag_id"]
          },
        ]
      }
      industrial_alarm_occurrences: {
        Row: {
          activated_at_ms: number
          alarm_definition_id: string
          edge_occurrence_id: string
          equipment_id: string | null
          gateway_id: string
          is_acknowledged: boolean
          is_active: boolean
          is_shelved: boolean
          occurrence_id: string
          plant_id: string
          priority: number
          severity: string
          tag_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activated_at_ms: number
          alarm_definition_id: string
          edge_occurrence_id: string
          equipment_id?: string | null
          gateway_id: string
          is_acknowledged?: boolean
          is_active?: boolean
          is_shelved?: boolean
          occurrence_id: string
          plant_id: string
          priority: number
          severity: string
          tag_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activated_at_ms?: number
          alarm_definition_id?: string
          edge_occurrence_id?: string
          equipment_id?: string | null
          gateway_id?: string
          is_acknowledged?: boolean
          is_active?: boolean
          is_shelved?: boolean
          occurrence_id?: string
          plant_id?: string
          priority?: number
          severity?: string
          tag_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "industrial_alarm_occurrences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industrial_alarm_occurrences_tenant_id_plant_id_alarm_defi_fkey"
            columns: ["tenant_id", "plant_id", "alarm_definition_id"]
            isOneToOne: false
            referencedRelation: "industrial_alarm_definitions"
            referencedColumns: ["tenant_id", "plant_id", "id"]
          },
        ]
      }
      industrial_alarm_transitions: {
        Row: {
          id: string
          occurred_at_ms: number
          occurrence_id: string
          operator_id: string | null
          origin: string
          quality: string
          received_at_ms: number
          sample_value: Json | null
          tenant_id: string
          transition_kind: string
          transition_sequence: number
        }
        Insert: {
          id?: string
          occurred_at_ms: number
          occurrence_id: string
          operator_id?: string | null
          origin: string
          quality: string
          received_at_ms: number
          sample_value?: Json | null
          tenant_id: string
          transition_kind: string
          transition_sequence: number
        }
        Update: {
          id?: string
          occurred_at_ms?: number
          occurrence_id?: string
          operator_id?: string | null
          origin?: string
          quality?: string
          received_at_ms?: number
          sample_value?: Json | null
          tenant_id?: string
          transition_kind?: string
          transition_sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "industrial_alarm_transitions_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "industrial_alarm_occurrences"
            referencedColumns: ["occurrence_id"]
          },
          {
            foreignKeyName: "industrial_alarm_transitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      industrial_dependency_edges: {
        Row: {
          created_at: string
          edge_id: string
          evidence_source: string
          from_component_id: string
          organization_id: string
          plant_id: string
          relation_type: string
          to_component_id: string
          validation_state: string
        }
        Insert: {
          created_at?: string
          edge_id: string
          evidence_source: string
          from_component_id: string
          organization_id: string
          plant_id: string
          relation_type: string
          to_component_id: string
          validation_state: string
        }
        Update: {
          created_at?: string
          edge_id?: string
          evidence_source?: string
          from_component_id?: string
          organization_id?: string
          plant_id?: string
          relation_type?: string
          to_component_id?: string
          validation_state?: string
        }
        Relationships: []
      }
      industrial_diagnostic_records: {
        Row: {
          affected_components: Json
          confidence: number
          confidence_method: string
          created_at: number
          diagnostic_id: string
          diagnostic_status: string
          evidence_references: Json
          expected_conditions: Json
          hypothesis: string
          incident_id: string | null
          missing_information: Json
          observed_conditions: Json
          organization_id: string
          plant_id: string
          primary_component: string
          recommended_runbook_ids: Json
          rule_id: string
          rule_version: string
        }
        Insert: {
          affected_components?: Json
          confidence: number
          confidence_method: string
          created_at: number
          diagnostic_id: string
          diagnostic_status: string
          evidence_references?: Json
          expected_conditions?: Json
          hypothesis: string
          incident_id?: string | null
          missing_information?: Json
          observed_conditions?: Json
          organization_id: string
          plant_id: string
          primary_component: string
          recommended_runbook_ids?: Json
          rule_id: string
          rule_version: string
        }
        Update: {
          affected_components?: Json
          confidence?: number
          confidence_method?: string
          created_at?: number
          diagnostic_id?: string
          diagnostic_status?: string
          evidence_references?: Json
          expected_conditions?: Json
          hypothesis?: string
          incident_id?: string | null
          missing_information?: Json
          observed_conditions?: Json
          organization_id?: string
          plant_id?: string
          primary_component?: string
          recommended_runbook_ids?: Json
          rule_id?: string
          rule_version?: string
        }
        Relationships: []
      }
      industrial_equipment_revisions: {
        Row: {
          changed_at: string
          changed_by: string
          changed_fields: string[]
          equipment_id: string
          id: string
          plant_id: string
          revision: number
          snapshot: Json
          tenant_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          changed_fields?: string[]
          equipment_id: string
          id?: string
          plant_id: string
          revision: number
          snapshot?: Json
          tenant_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          changed_fields?: string[]
          equipment_id?: string
          id?: string
          plant_id?: string
          revision?: number
          snapshot?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "industrial_equipment_revision_tenant_id_plant_id_equipment_fkey"
            columns: ["tenant_id", "plant_id", "equipment_id"]
            isOneToOne: false
            referencedRelation: "industrial_equipments"
            referencedColumns: ["tenant_id", "plant_id", "id"]
          },
          {
            foreignKeyName: "industrial_equipment_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      industrial_equipment_types: {
        Row: {
          catalog_type: string
          category: string
          created_at: string
          id: string
          manufacturer: string | null
          model: string | null
        }
        Insert: {
          catalog_type: string
          category: string
          created_at?: string
          id: string
          manufacturer?: string | null
          model?: string | null
        }
        Update: {
          catalog_type?: string
          category?: string
          created_at?: string
          id?: string
          manufacturer?: string | null
          model?: string | null
        }
        Relationships: []
      }
      industrial_equipments: {
        Row: {
          created_at: string
          description: string
          display_name: string
          equipment_type_id: string
          id: string
          plant_id: string
          project_id: string | null
          revision: number
          sector_id: string | null
          tag_code: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          display_name?: string
          equipment_type_id: string
          id: string
          plant_id: string
          project_id?: string | null
          revision?: number
          sector_id?: string | null
          tag_code: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          display_name?: string
          equipment_type_id?: string
          id?: string
          plant_id?: string
          project_id?: string | null
          revision?: number
          sector_id?: string | null
          tag_code?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "industrial_equipments_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            isOneToOne: false
            referencedRelation: "industrial_equipment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industrial_equipments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industrial_equipments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industrial_equipments_tenant_id_plant_id_fkey"
            columns: ["tenant_id", "plant_id"]
            isOneToOne: false
            referencedRelation: "industrial_plants"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      industrial_gateway_tag_sources: {
        Row: {
          active: boolean
          created_at: string
          gateway_id: string
          id: string
          offset_value: number | null
          physical_address: string
          plant_id: string
          protocol: string
          raw_unit: string | null
          scale: number | null
          source_id: string
          tag_id: string
          tenant_id: string
          write_enabled: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          gateway_id: string
          id: string
          offset_value?: number | null
          physical_address: string
          plant_id: string
          protocol: string
          raw_unit?: string | null
          scale?: number | null
          source_id: string
          tag_id: string
          tenant_id: string
          write_enabled?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          gateway_id?: string
          id?: string
          offset_value?: number | null
          physical_address?: string
          plant_id?: string
          protocol?: string
          raw_unit?: string | null
          scale?: number | null
          source_id?: string
          tag_id?: string
          tenant_id?: string
          write_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "industrial_gateway_tag_source_tenant_id_plant_id_gateway_i_fkey"
            columns: ["tenant_id", "plant_id", "gateway_id"]
            isOneToOne: false
            referencedRelation: "industrial_gateways"
            referencedColumns: ["tenant_id", "plant_id", "id"]
          },
          {
            foreignKeyName: "industrial_gateway_tag_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industrial_gateway_tag_sources_tenant_id_plant_id_tag_id_fkey"
            columns: ["tenant_id", "plant_id", "tag_id"]
            isOneToOne: false
            referencedRelation: "industrial_tags"
            referencedColumns: ["tenant_id", "plant_id", "tag_id"]
          },
        ]
      }
      industrial_gateways: {
        Row: {
          certificate_fingerprint: string
          created_at: string
          credential_hash: string
          id: string
          is_revoked: boolean
          name: string
          plant_id: string
          sector_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          certificate_fingerprint: string
          created_at?: string
          credential_hash: string
          id: string
          is_revoked?: boolean
          name: string
          plant_id: string
          sector_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          certificate_fingerprint?: string
          created_at?: string
          credential_hash?: string
          id?: string
          is_revoked?: boolean
          name?: string
          plant_id?: string
          sector_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "industrial_gateways_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industrial_gateways_tenant_id_plant_id_fkey"
            columns: ["tenant_id", "plant_id"]
            isOneToOne: false
            referencedRelation: "industrial_plants"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      industrial_historian_samples: {
        Row: {
          batch_id: string
          configuration_version: number
          edge_received_at_ms: number
          engineering_value: Json | null
          equipment_id: string | null
          gateway_id: string
          id: string
          ingestion_timestamp_ms: number
          is_late: boolean
          plant_id: string
          provenance: string
          quality: string
          raw_value: Json
          sequence_number: number
          source_id: string
          source_timestamp_ms: number
          tag_id: string
          tag_revision: number
          tenant_id: string
          transformation: Json
        }
        Insert: {
          batch_id: string
          configuration_version: number
          edge_received_at_ms: number
          engineering_value?: Json | null
          equipment_id?: string | null
          gateway_id: string
          id?: string
          ingestion_timestamp_ms: number
          is_late?: boolean
          plant_id: string
          provenance: string
          quality: string
          raw_value: Json
          sequence_number: number
          source_id: string
          source_timestamp_ms: number
          tag_id: string
          tag_revision: number
          tenant_id: string
          transformation: Json
        }
        Update: {
          batch_id?: string
          configuration_version?: number
          edge_received_at_ms?: number
          engineering_value?: Json | null
          equipment_id?: string | null
          gateway_id?: string
          id?: string
          ingestion_timestamp_ms?: number
          is_late?: boolean
          plant_id?: string
          provenance?: string
          quality?: string
          raw_value?: Json
          sequence_number?: number
          source_id?: string
          source_timestamp_ms?: number
          tag_id?: string
          tag_revision?: number
          tenant_id?: string
          transformation?: Json
        }
        Relationships: [
          {
            foreignKeyName: "industrial_historian_samples_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industrial_historian_samples_tenant_id_plant_id_tag_id_fkey"
            columns: ["tenant_id", "plant_id", "tag_id"]
            isOneToOne: false
            referencedRelation: "industrial_tags"
            referencedColumns: ["tenant_id", "plant_id", "tag_id"]
          },
        ]
      }
      industrial_incident_rejected_hypotheses: {
        Row: {
          diagnostic_id: string
          hypothesis: string
          id: string
          incident_id: string
          organization_id: string
          reason: string
          rejected_at: number
          rejected_by: string
        }
        Insert: {
          diagnostic_id: string
          hypothesis: string
          id?: string
          incident_id: string
          organization_id: string
          reason: string
          rejected_at: number
          rejected_by: string
        }
        Update: {
          diagnostic_id?: string
          hypothesis?: string
          id?: string
          incident_id?: string
          organization_id?: string
          reason?: string
          rejected_at?: number
          rejected_by?: string
        }
        Relationships: []
      }
      industrial_plants: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id: string
          name: string
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "industrial_plants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      industrial_sectors: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          plant_id: string
          tenant_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id: string
          name: string
          plant_id: string
          tenant_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          plant_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "industrial_sectors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industrial_sectors_tenant_id_plant_id_fkey"
            columns: ["tenant_id", "plant_id"]
            isOneToOne: false
            referencedRelation: "industrial_plants"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      industrial_tag_bindings: {
        Row: {
          created_at: string
          equipment_id: string
          id: string
          plant_id: string
          plc_channel_id: string | null
          role: string
          tag_id: string
          tenant_id: string
          terminal_id: string | null
        }
        Insert: {
          created_at?: string
          equipment_id: string
          id: string
          plant_id: string
          plc_channel_id?: string | null
          role: string
          tag_id: string
          tenant_id: string
          terminal_id?: string | null
        }
        Update: {
          created_at?: string
          equipment_id?: string
          id?: string
          plant_id?: string
          plc_channel_id?: string | null
          role?: string
          tag_id?: string
          tenant_id?: string
          terminal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "industrial_tag_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industrial_tag_bindings_tenant_id_plant_id_equipment_id_fkey"
            columns: ["tenant_id", "plant_id", "equipment_id"]
            isOneToOne: false
            referencedRelation: "industrial_equipments"
            referencedColumns: ["tenant_id", "plant_id", "id"]
          },
          {
            foreignKeyName: "industrial_tag_bindings_tenant_id_plant_id_tag_id_fkey"
            columns: ["tenant_id", "plant_id", "tag_id"]
            isOneToOne: false
            referencedRelation: "industrial_tags"
            referencedColumns: ["tenant_id", "plant_id", "tag_id"]
          },
        ]
      }
      industrial_tag_revisions: {
        Row: {
          changed_at: string
          changed_by: string
          changed_fields: string[]
          id: string
          plant_id: string
          revision: number
          snapshot: Json
          tag_id: string
          tenant_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          changed_fields?: string[]
          id?: string
          plant_id: string
          revision: number
          snapshot?: Json
          tag_id: string
          tenant_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          changed_fields?: string[]
          id?: string
          plant_id?: string
          revision?: number
          snapshot?: Json
          tag_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "industrial_tag_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industrial_tag_revisions_tenant_id_plant_id_tag_id_fkey"
            columns: ["tenant_id", "plant_id", "tag_id"]
            isOneToOne: false
            referencedRelation: "industrial_tags"
            referencedColumns: ["tenant_id", "plant_id", "tag_id"]
          },
        ]
      }
      industrial_tags: {
        Row: {
          canonical_name: string
          configuration_version: number
          created_at: string
          data_type: string
          deadband: number
          display_name: string
          engineering_unit: string
          equipment_id: string | null
          maximum_value: number | null
          minimum_value: number | null
          offset_value: number
          plant_id: string
          precision: number
          raw_unit: string | null
          retention_class: string
          revision: number
          sample_interval_ms: number
          scale: number
          source_kind: string
          stale_after_ms: number
          tag_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          canonical_name: string
          configuration_version?: number
          created_at?: string
          data_type: string
          deadband?: number
          display_name?: string
          engineering_unit?: string
          equipment_id?: string | null
          maximum_value?: number | null
          minimum_value?: number | null
          offset_value?: number
          plant_id: string
          precision?: number
          raw_unit?: string | null
          retention_class?: string
          revision?: number
          sample_interval_ms?: number
          scale?: number
          source_kind?: string
          stale_after_ms?: number
          tag_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          canonical_name?: string
          configuration_version?: number
          created_at?: string
          data_type?: string
          deadband?: number
          display_name?: string
          engineering_unit?: string
          equipment_id?: string | null
          maximum_value?: number | null
          minimum_value?: number | null
          offset_value?: number
          plant_id?: string
          precision?: number
          raw_unit?: string | null
          retention_class?: string
          revision?: number
          sample_interval_ms?: number
          scale?: number
          source_kind?: string
          stale_after_ms?: number
          tag_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "industrial_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industrial_tags_tenant_id_plant_id_equipment_id_fkey"
            columns: ["tenant_id", "plant_id", "equipment_id"]
            isOneToOne: false
            referencedRelation: "industrial_equipments"
            referencedColumns: ["tenant_id", "plant_id", "id"]
          },
          {
            foreignKeyName: "industrial_tags_tenant_id_plant_id_fkey"
            columns: ["tenant_id", "plant_id"]
            isOneToOne: false
            referencedRelation: "industrial_plants"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_name: string | null
          invited_sector: string | null
          role: string
          tenant_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_name?: string | null
          invited_sector?: string | null
          role: string
          tenant_id: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_name?: string | null
          invited_sector?: string | null
          role?: string
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          pdf_url: string | null
          status: string
          stripe_invoice_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          id?: string
          pdf_url?: string | null
          status: string
          stripe_invoice_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          pdf_url?: string | null
          status?: string
          stripe_invoice_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      iot_alerts: {
        Row: {
          created_at: string | null
          device_id: string | null
          id: string
          is_resolved: boolean | null
          level: Database["public"]["Enums"]["alert_level"]
          message: string
          timestamp: string
          value: number | null
        }
        Insert: {
          created_at?: string | null
          device_id?: string | null
          id?: string
          is_resolved?: boolean | null
          level: Database["public"]["Enums"]["alert_level"]
          message: string
          timestamp: string
          value?: number | null
        }
        Update: {
          created_at?: string | null
          device_id?: string | null
          id?: string
          is_resolved?: boolean | null
          level?: Database["public"]["Enums"]["alert_level"]
          message?: string
          timestamp?: string
          value?: number | null
        }
        Relationships: []
      }
      iot_command_log: {
        Row: {
          acked_at: string | null
          command: string
          command_id: string
          delivered_at: string | null
          executed_at: string | null
          expires_at: string | null
          fail_safe_on_timeout: boolean
          id: string
          metadata: Json
          payload: Json
          requested_at: string
          requested_by: string | null
          result_message: string | null
          state: Database["public"]["Enums"]["iot_command_state"]
          target_device: string
          tenant_id: string
          watchdog_timeout_ms: number
        }
        Insert: {
          acked_at?: string | null
          command: string
          command_id: string
          delivered_at?: string | null
          executed_at?: string | null
          expires_at?: string | null
          fail_safe_on_timeout?: boolean
          id?: string
          metadata?: Json
          payload?: Json
          requested_at: string
          requested_by?: string | null
          result_message?: string | null
          state: Database["public"]["Enums"]["iot_command_state"]
          target_device: string
          tenant_id: string
          watchdog_timeout_ms: number
        }
        Update: {
          acked_at?: string | null
          command?: string
          command_id?: string
          delivered_at?: string | null
          executed_at?: string | null
          expires_at?: string | null
          fail_safe_on_timeout?: boolean
          id?: string
          metadata?: Json
          payload?: Json
          requested_at?: string
          requested_by?: string | null
          result_message?: string | null
          state?: Database["public"]["Enums"]["iot_command_state"]
          target_device?: string
          tenant_id?: string
          watchdog_timeout_ms?: number
        }
        Relationships: []
      }
      iot_devices: {
        Row: {
          created_at: string | null
          device_external_id: string
          id: string
          kind: Database["public"]["Enums"]["sensor_kind"] | null
          metadata: Json | null
          name: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          device_external_id: string
          id?: string
          kind?: Database["public"]["Enums"]["sensor_kind"] | null
          metadata?: Json | null
          name: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          device_external_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["sensor_kind"] | null
          metadata?: Json | null
          name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iot_devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      iot_readings: {
        Row: {
          created_at: string | null
          device_id: string | null
          id: string
          ingested_at: string
          message_id: string | null
          metric: string | null
          quality: string
          seq: number | null
          timestamp: string
          ttl_ms: number
          unit: string | null
          value: number
        }
        Insert: {
          created_at?: string | null
          device_id?: string | null
          id?: string
          ingested_at?: string
          message_id?: string | null
          metric?: string | null
          quality: string
          seq?: number | null
          timestamp: string
          ttl_ms: number
          unit?: string | null
          value: number
        }
        Update: {
          created_at?: string | null
          device_id?: string | null
          id?: string
          ingested_at?: string
          message_id?: string | null
          metric?: string | null
          quality?: string
          seq?: number | null
          timestamp?: string
          ttl_ms?: number
          unit?: string | null
          value?: number
        }
        Relationships: []
      }
      knowledge_chunks: {
        Row: {
          chunk_text: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          chunk_text: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          chunk_text?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      knowledge_documents: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json | null
          source_id: string | null
          source_type: string
          tenant_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          source_id?: string | null
          source_type: string
          tenant_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          source_id?: string | null
          source_type?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      mp_payment_state_machine: {
        Row: {
          amount_cents: number
          currency: string
          current_status: string
          external_payment_id: string
          plan: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          currency?: string
          current_status: string
          external_payment_id: string
          plan?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          currency?: string
          current_status?: string
          external_payment_id?: string
          plan?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mp_payment_state_machine_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_webhook_processed: {
        Row: {
          payment_id: string
          processed_at: string
        }
        Insert: {
          payment_id: string
          processed_at?: string
        }
        Update: {
          payment_id?: string
          processed_at?: string
        }
        Relationships: []
      }
      normative_chunks: {
        Row: {
          category: string
          chunk_text: string
          chunk_vector: string | null
          created_at: string
          document_id: string
          id: string
          metadata: Json | null
          search_text: string | null
        }
        Insert: {
          category: string
          chunk_text: string
          chunk_vector?: string | null
          created_at?: string
          document_id: string
          id?: string
          metadata?: Json | null
          search_text?: string | null
        }
        Update: {
          category?: string
          chunk_text?: string
          chunk_vector?: string | null
          created_at?: string
          document_id?: string
          id?: string
          metadata?: Json | null
          search_text?: string | null
        }
        Relationships: []
      }
      normative_documents: {
        Row: {
          code: string
          created_at: string
          id: string
          section: string | null
          source_type: string
          title: string
          version: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          section?: string | null
          source_type: string
          title: string
          version?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          section?: string | null
          source_type?: string
          title?: string
          version?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          message: string
          read_at: string | null
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          message: string
          read_at?: string | null
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          message?: string
          read_at?: string | null
          tenant_id?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      observability_alert_policies: {
        Row: {
          component_type: string
          cpu_critical_pct: number
          cpu_warning_pct: number
          created_at: string
          disk_critical_pct: number
          disk_warning_pct: number
          heartbeat_timeout_ms: number
          hysteresis_required: number
          id: string
          is_active: boolean
          max_clock_drift_ms: number
          max_latency_critical_ms: number
          max_latency_warning_ms: number
          memory_critical_pct: number
          memory_warning_pct: number
          name: string
          tenant_id: string
          version: string
        }
        Insert: {
          component_type: string
          cpu_critical_pct?: number
          cpu_warning_pct?: number
          created_at?: string
          disk_critical_pct?: number
          disk_warning_pct?: number
          heartbeat_timeout_ms?: number
          hysteresis_required?: number
          id?: string
          is_active?: boolean
          max_clock_drift_ms?: number
          max_latency_critical_ms?: number
          max_latency_warning_ms?: number
          memory_critical_pct?: number
          memory_warning_pct?: number
          name: string
          tenant_id: string
          version?: string
        }
        Update: {
          component_type?: string
          cpu_critical_pct?: number
          cpu_warning_pct?: number
          created_at?: string
          disk_critical_pct?: number
          disk_warning_pct?: number
          heartbeat_timeout_ms?: number
          hysteresis_required?: number
          id?: string
          is_active?: boolean
          max_clock_drift_ms?: number
          max_latency_critical_ms?: number
          max_latency_warning_ms?: number
          memory_critical_pct?: number
          memory_warning_pct?: number
          name?: string
          tenant_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "observability_alert_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      observability_health_snapshots: {
        Row: {
          component_id: string
          component_type: string
          created_at: string
          evaluation_window_ms: number
          evidence_reference: string
          flapping_detected: boolean
          id: string
          last_successful_observation_at: string | null
          metric_values: Json
          observed_at: string
          plant_id: string
          reason_code: string
          severity: string
          source: string
          state: string
          tenant_id: string
          threshold_version: string
        }
        Insert: {
          component_id: string
          component_type: string
          created_at?: string
          evaluation_window_ms?: number
          evidence_reference: string
          flapping_detected?: boolean
          id?: string
          last_successful_observation_at?: string | null
          metric_values?: Json
          observed_at?: string
          plant_id: string
          reason_code: string
          severity: string
          source: string
          state: string
          tenant_id: string
          threshold_version?: string
        }
        Update: {
          component_id?: string
          component_type?: string
          created_at?: string
          evaluation_window_ms?: number
          evidence_reference?: string
          flapping_detected?: boolean
          id?: string
          last_successful_observation_at?: string | null
          metric_values?: Json
          observed_at?: string
          plant_id?: string
          reason_code?: string
          severity?: string
          source?: string
          state?: string
          tenant_id?: string
          threshold_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "observability_health_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      observability_incident_transitions: {
        Row: {
          actor_email: string
          actor_id: string
          actor_role: string
          created_at: string
          from_status: string
          incident_id: string
          note: string
          tamper_proof_hash: string
          tenant_id: string
          timestamp: string
          to_status: string
          transition_id: string
        }
        Insert: {
          actor_email: string
          actor_id: string
          actor_role: string
          created_at?: string
          from_status: string
          incident_id: string
          note: string
          tamper_proof_hash: string
          tenant_id: string
          timestamp?: string
          to_status: string
          transition_id: string
        }
        Update: {
          actor_email?: string
          actor_id?: string
          actor_role?: string
          created_at?: string
          from_status?: string
          incident_id?: string
          note?: string
          tamper_proof_hash?: string
          tenant_id?: string
          timestamp?: string
          to_status?: string
          transition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "observability_incident_transitions_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "observability_incidents"
            referencedColumns: ["incident_id"]
          },
          {
            foreignKeyName: "observability_incident_transitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      observability_incidents: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          assigned_to: Json | null
          category: string
          correlation_id: string
          created_at: string
          dedup_count: number
          description: string
          evidence: Json
          first_observed_at: string
          impact: string
          incident_id: string
          last_observed_at: string
          plant_id: string
          related_alarms: string[]
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source_component_id: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          assigned_to?: Json | null
          category: string
          correlation_id: string
          created_at?: string
          dedup_count?: number
          description: string
          evidence?: Json
          first_observed_at?: string
          impact: string
          incident_id: string
          last_observed_at?: string
          plant_id: string
          related_alarms?: string[]
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          source_component_id: string
          status: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          assigned_to?: Json | null
          category?: string
          correlation_id?: string
          created_at?: string
          dedup_count?: number
          description?: string
          evidence?: Json
          first_observed_at?: string
          impact?: string
          incident_id?: string
          last_observed_at?: string
          plant_id?: string
          related_alarms?: string[]
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_component_id?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "observability_incidents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      observability_pipeline_checkpoints: {
        Row: {
          checkpoint_time: string
          drop_reason: string | null
          gateway_id: string
          id: string
          plant_id: string
          samples_dropped: number
          samples_in: number
          samples_out: number
          stage: string
          tenant_id: string
        }
        Insert: {
          checkpoint_time?: string
          drop_reason?: string | null
          gateway_id: string
          id?: string
          plant_id: string
          samples_dropped?: number
          samples_in?: number
          samples_out?: number
          stage: string
          tenant_id: string
        }
        Update: {
          checkpoint_time?: string
          drop_reason?: string | null
          gateway_id?: string
          id?: string
          plant_id?: string
          samples_dropped?: number
          samples_in?: number
          samples_out?: number
          stage?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "observability_pipeline_checkpoints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      observability_slo_definitions: {
        Row: {
          calculation_method: string
          created_at: string
          denominator_description: string
          description: string
          evaluation_window_days: number
          name: string
          numerator_description: string
          slo_id: string
          target_percent: number
          target_service: string
          unit: string
          version: string
        }
        Insert: {
          calculation_method: string
          created_at?: string
          denominator_description: string
          description: string
          evaluation_window_days?: number
          name: string
          numerator_description: string
          slo_id: string
          target_percent: number
          target_service: string
          unit?: string
          version?: string
        }
        Update: {
          calculation_method?: string
          created_at?: string
          denominator_description?: string
          description?: string
          evaluation_window_days?: number
          name?: string
          numerator_description?: string
          slo_id?: string
          target_percent?: number
          target_service?: string
          unit?: string
          version?: string
        }
        Relationships: []
      }
      observability_slo_measurements: {
        Row: {
          achieved_percent: number
          created_at: string
          eligible_denominator: number
          error_budget_consumed_pct: number
          error_budget_remaining_pct: number
          error_budget_total_pct: number
          id: string
          is_compliant: boolean
          period_end: string
          period_start: string
          planned_maintenance_ms: number
          slo_id: string
          target_percent: number
          tenant_id: string
          total_observations: number
          unplanned_outage_ms: number
          valid_observations: number
        }
        Insert: {
          achieved_percent: number
          created_at?: string
          eligible_denominator: number
          error_budget_consumed_pct: number
          error_budget_remaining_pct: number
          error_budget_total_pct: number
          id?: string
          is_compliant: boolean
          period_end: string
          period_start: string
          planned_maintenance_ms?: number
          slo_id: string
          target_percent: number
          tenant_id: string
          total_observations: number
          unplanned_outage_ms?: number
          valid_observations: number
        }
        Update: {
          achieved_percent?: number
          created_at?: string
          eligible_denominator?: number
          error_budget_consumed_pct?: number
          error_budget_remaining_pct?: number
          error_budget_total_pct?: number
          id?: string
          is_compliant?: boolean
          period_end?: string
          period_start?: string
          planned_maintenance_ms?: number
          slo_id?: string
          target_percent?: number
          tenant_id?: string
          total_observations?: number
          unplanned_outage_ms?: number
          valid_observations?: number
        }
        Relationships: [
          {
            foreignKeyName: "observability_slo_measurements_slo_id_fkey"
            columns: ["slo_id"]
            isOneToOne: false
            referencedRelation: "observability_slo_definitions"
            referencedColumns: ["slo_id"]
          },
          {
            foreignKeyName: "observability_slo_measurements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_applied_packages: {
        Row: {
          applied_at: string
          gateway_id: string
          id: string
          manifest_hash: string
          package_id: string
          target_version: string
          tenant_id: string | null
        }
        Insert: {
          applied_at?: string
          gateway_id: string
          id: string
          manifest_hash: string
          package_id: string
          target_version: string
          tenant_id?: string | null
        }
        Update: {
          applied_at?: string
          gateway_id?: string
          id?: string
          manifest_hash?: string
          package_id?: string
          target_version?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ota_applied_packages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_campaigns: {
        Row: {
          campaign_id: string
          organization_id: string
          payload_json: Json
          plant_id: string
          record_version: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          organization_id: string
          payload_json: Json
          plant_id: string
          record_version?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          organization_id?: string
          payload_json?: Json
          plant_id?: string
          record_version?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ota_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_signing_keys: {
        Row: {
          created_at: string
          key_id: string
          public_key_pem: string
          revoked_at: string | null
          revoked_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          key_id: string
          public_key_pem: string
          revoked_at?: string | null
          revoked_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          key_id?: string
          public_key_pem?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      plan_limits: {
        Row: {
          features: Json | null
          id: string
          max_ai_tokens_month: number
          max_iot_devices: number
          max_projects: number
          max_storage_mb: number
          max_users: number
          plan: string
        }
        Insert: {
          features?: Json | null
          id?: string
          max_ai_tokens_month: number
          max_iot_devices?: number
          max_projects: number
          max_storage_mb: number
          max_users: number
          plan: string
        }
        Update: {
          features?: Json | null
          id?: string
          max_ai_tokens_month?: number
          max_iot_devices?: number
          max_projects?: number
          max_storage_mb?: number
          max_users?: number
          plan?: string
        }
        Relationships: []
      }
      plant_telemetry: {
        Row: {
          last_updated: string | null
          tag_id: string
          value: number | null
        }
        Insert: {
          last_updated?: string | null
          tag_id: string
          value?: number | null
        }
        Update: {
          last_updated?: string | null
          tag_id?: string
          value?: number | null
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          locale: string
          preferences: Json | null
          role: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          locale?: string
          preferences?: Json | null
          role?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          locale?: string
          preferences?: Json | null
          role?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_bom_items: {
        Row: {
          component_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          manufacturer: string | null
          notes: string | null
          part_number: string | null
          project_id: string
          quantity: number
          reference: string | null
          source: string
          unit: string
          unit_price_brl: number | null
          updated_at: string
        }
        Insert: {
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          manufacturer?: string | null
          notes?: string | null
          part_number?: string | null
          project_id: string
          quantity?: number
          reference?: string | null
          source?: string
          unit?: string
          unit_price_brl?: number | null
          updated_at?: string
        }
        Update: {
          component_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          manufacturer?: string | null
          notes?: string | null
          part_number?: string | null
          project_id?: string
          quantity?: number
          reference?: string | null
          source?: string
          unit?: string
          unit_price_brl?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      project_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_folders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_versions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          project_id: string
          snapshot: Json
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          project_id: string
          snapshot?: Json
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string
          snapshot?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string
          description: string | null
          folder_id: string | null
          id: string
          metadata: Json | null
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          folder_id?: string | null
          id?: string
          metadata?: Json | null
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          folder_id?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      provisioning_station_bindings: {
        Row: {
          bound_at: string
          gateway_id: string
          station_key: string
          tenant_id: string | null
        }
        Insert: {
          bound_at?: string
          gateway_id: string
          station_key: string
          tenant_id?: string | null
        }
        Update: {
          bound_at?: string
          gateway_id?: string
          station_key?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provisioning_station_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      provisioning_tokens: {
        Row: {
          consumed_at: string | null
          expires_at: string
          is_consumed: boolean
          is_revoked: boolean
          organization_id: string
          payload_json: Json
          plant_id: string
          record_version: number
          station_id: string
          tenant_id: string | null
          token_hash: string
        }
        Insert: {
          consumed_at?: string | null
          expires_at: string
          is_consumed?: boolean
          is_revoked?: boolean
          organization_id: string
          payload_json: Json
          plant_id: string
          record_version?: number
          station_id: string
          tenant_id?: string | null
          token_hash: string
        }
        Update: {
          consumed_at?: string | null
          expires_at?: string
          is_consumed?: boolean
          is_revoked?: boolean
          organization_id?: string
          payload_json?: Json
          plant_id?: string
          record_version?: number
          station_id?: string
          tenant_id?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "provisioning_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      remote_configs: {
        Row: {
          config_version: number
          created_at: string
          gateway_id: string
          id: string
          is_lkgc: boolean
          payload_json: Json
          tenant_id: string | null
        }
        Insert: {
          config_version: number
          created_at?: string
          gateway_id: string
          id: string
          is_lkgc?: boolean
          payload_json: Json
          tenant_id?: string | null
        }
        Update: {
          config_version?: number
          created_at?: string
          gateway_id?: string
          id?: string
          is_lkgc?: boolean
          payload_json?: Json
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remote_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_logs: {
        Row: {
          channel: string
          created_at: string
          id: string
          level: string
          message: string
          tag: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          level?: string
          message?: string
          tag?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          level?: string
          message?: string
          tag?: string
          user_id?: string
        }
        Relationships: []
      }
      simulation_tags: {
        Row: {
          created_at: string
          current_value: Json
          data_type: Database["public"]["Enums"]["simulation_tag_data_type"]
          id: string
          initial_value: Json
          last_updated: string
          project_id: string
          quality: string
          tag_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_value?: Json
          data_type: Database["public"]["Enums"]["simulation_tag_data_type"]
          id?: string
          initial_value?: Json
          last_updated: string
          project_id: string
          quality: string
          tag_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_value?: Json
          data_type?: Database["public"]["Enums"]["simulation_tag_data_type"]
          id?: string
          initial_value?: Json
          last_updated?: string
          project_id?: string
          quality?: string
          tag_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      simulations: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          error_message: string | null
          execution_time_ms: number | null
          id: string
          name: string
          parameters: Json
          project_id: string
          results: Json
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          name: string
          parameters?: Json
          project_id: string
          results?: Json
          status: string
          type: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          name?: string
          parameters?: Json
          project_id?: string
          results?: Json
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          event_type: string | null
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type?: string | null
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string | null
          processed_at?: string
        }
        Relationships: []
      }
      subscription_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          new_plan_type: Database["public"]["Enums"]["subscription_plan"] | null
          new_status: Database["public"]["Enums"]["subscription_status"] | null
          old_plan_type: Database["public"]["Enums"]["subscription_plan"] | null
          old_status: Database["public"]["Enums"]["subscription_status"] | null
          reason: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_plan_type?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          new_status?: Database["public"]["Enums"]["subscription_status"] | null
          old_plan_type?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          old_status?: Database["public"]["Enums"]["subscription_status"] | null
          reason?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_plan_type?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          new_status?: Database["public"]["Enums"]["subscription_status"] | null
          old_plan_type?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          old_status?: Database["public"]["Enums"]["subscription_status"] | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan: string
          status: string
          stripe_subscription_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan: string
          status: string
          stripe_subscription_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_templates: {
        Row: {
          category: Database["public"]["Enums"]["template_category"]
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_builtin: boolean
          name: string
          template_data: Json
          tenant_id: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["template_category"]
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          is_builtin?: boolean
          name: string
          template_data?: Json
          tenant_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["template_category"]
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_builtin?: boolean
          name?: string
          template_data?: Json
          tenant_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tag_samples: {
        Row: {
          equipment_id: string | null
          id: number
          project_id: string
          quality: string
          received_at: string
          sampled_at: string
          sequence_number: number | null
          source: string
          tag_name: string
          unit: string | null
          value: number
        }
        Insert: {
          equipment_id?: string | null
          id?: number
          project_id: string
          quality: string
          received_at?: string
          sampled_at: string
          sequence_number?: number | null
          source?: string
          tag_name: string
          unit?: string | null
          value: number
        }
        Update: {
          equipment_id?: string | null
          id?: number
          project_id?: string
          quality?: string
          received_at?: string
          sampled_at?: string
          sequence_number?: number | null
          source?: string
          tag_name?: string
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "tag_samples_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_samples_2026_04: {
        Row: {
          id: number
          project_id: string
          quality: string
          sampled_at: string
          tag_name: string
          value: number
        }
        Insert: {
          id: number
          project_id: string
          quality: string
          sampled_at: string
          tag_name: string
          value: number
        }
        Update: {
          id?: number
          project_id?: string
          quality?: string
          sampled_at?: string
          tag_name?: string
          value?: number
        }
        Relationships: []
      }
      tag_samples_2026_05: {
        Row: {
          id: number
          project_id: string
          quality: string
          sampled_at: string
          tag_name: string
          value: number
        }
        Insert: {
          id: number
          project_id: string
          quality: string
          sampled_at: string
          tag_name: string
          value: number
        }
        Update: {
          id?: number
          project_id?: string
          quality?: string
          sampled_at?: string
          tag_name?: string
          value?: number
        }
        Relationships: []
      }
      tenant_catalog_items: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          datasheet_url: string | null
          description: string | null
          id: string
          manufacturer: string
          part_number: string
          price_source: string
          price_updated_at: string | null
          rated_current_a: number | null
          rated_voltage_v: number | null
          source_part_id: string | null
          source_url: string | null
          stock: number | null
          tenant_id: string
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          datasheet_url?: string | null
          description?: string | null
          id?: string
          manufacturer: string
          part_number: string
          price_source?: string
          price_updated_at?: string | null
          rated_current_a?: number | null
          rated_voltage_v?: number | null
          source_part_id?: string | null
          source_url?: string | null
          stock?: number | null
          tenant_id: string
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          datasheet_url?: string | null
          description?: string | null
          id?: string
          manufacturer?: string
          part_number?: string
          price_source?: string
          price_updated_at?: string | null
          rated_current_a?: number | null
          rated_voltage_v?: number | null
          source_part_id?: string | null
          source_url?: string | null
          stock?: number | null
          tenant_id?: string
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_catalog_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_by: string | null
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          created_at: string
          key: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          key: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          key?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      tenants: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          plan: string
          settings: Json | null
          slug: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          plan?: string
          settings?: Json | null
          slug: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          plan?: string
          settings?: Json | null
          slug?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      test_scenario_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          duration_ms: number | null
          error_details: Json | null
          events: Json | null
          failure_reason: string | null
          id: string
          ladder_final_state: Json | null
          ladder_initial_state: Json | null
          metrics: Json | null
          passed: boolean | null
          plant_final_state: Json | null
          plant_initial_state: Json | null
          run_number: number
          scenario_id: string
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          events?: Json | null
          failure_reason?: string | null
          id?: string
          ladder_final_state?: Json | null
          ladder_initial_state?: Json | null
          metrics?: Json | null
          passed?: boolean | null
          plant_final_state?: Json | null
          plant_initial_state?: Json | null
          run_number?: number
          scenario_id: string
          started_at?: string
          status: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          events?: Json | null
          failure_reason?: string | null
          id?: string
          ladder_final_state?: Json | null
          ladder_initial_state?: Json | null
          metrics?: Json | null
          passed?: boolean | null
          plant_final_state?: Json | null
          plant_initial_state?: Json | null
          run_number?: number
          scenario_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_scenario_runs_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      test_scenarios: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          expected_results: Json | null
          id: string
          is_public: boolean | null
          is_template: boolean | null
          ladder_program: Json | null
          last_run_at: string | null
          last_run_result: Json | null
          name: string
          plant_config: Json
          project_id: string
          scenario_type: string
          tags: string[] | null
          unifilar_snapshot: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expected_results?: Json | null
          id?: string
          is_public?: boolean | null
          is_template?: boolean | null
          ladder_program?: Json | null
          last_run_at?: string | null
          last_run_result?: Json | null
          name: string
          plant_config?: Json
          project_id: string
          scenario_type: string
          tags?: string[] | null
          unifilar_snapshot?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expected_results?: Json | null
          id?: string
          is_public?: boolean | null
          is_template?: boolean | null
          ladder_program?: Json | null
          last_run_at?: string | null
          last_run_result?: Json | null
          name?: string
          plant_config?: Json
          project_id?: string
          scenario_type?: string
          tags?: string[] | null
          unifilar_snapshot?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      trend_configs: {
        Row: {
          chart_type: string
          color_map: Json
          created_at: string
          description: string | null
          id: string
          name: string
          period_seconds: number
          project_id: string
          sample_rate_ms: number
          tags: string[]
          updated_at: string
        }
        Insert: {
          chart_type: string
          color_map?: Json
          created_at?: string
          description?: string | null
          id?: string
          name: string
          period_seconds: number
          project_id: string
          sample_rate_ms: number
          tags?: string[]
          updated_at?: string
        }
        Update: {
          chart_type?: string
          color_map?: Json
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          period_seconds?: number
          project_id?: string
          sample_rate_ms?: number
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      unifilar_ladder_mapping: {
        Row: {
          created_at: string
          created_by: string | null
          equipment_id: string
          equipment_type: string
          id: string
          is_primary: boolean | null
          ladder_tag_name: string
          mapping_type: string
          project_id: string
          unifilar_node_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          equipment_id: string
          equipment_type: string
          id?: string
          is_primary?: boolean | null
          ladder_tag_name: string
          mapping_type: string
          project_id: string
          unifilar_node_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          equipment_id?: string
          equipment_type?: string
          id?: string
          is_primary?: boolean | null
          ladder_tag_name?: string
          mapping_type?: string
          project_id?: string
          unifilar_node_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_records: {
        Row: {
          ai_tokens_used: number
          created_at: string
          id: string
          period: string
          simulations_run: number
          storage_used_mb: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ai_tokens_used?: number
          created_at?: string
          id?: string
          period: string
          simulations_run?: number
          storage_used_mb?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ai_tokens_used?: number
          created_at?: string
          id?: string
          period?: string
          simulations_run?: number
          storage_used_mb?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_function_block_templates: {
        Row: {
          category: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_public: boolean
          name: string
          pins: Json
          structured_text: string
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          category: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_public?: boolean
          name: string
          pins?: Json
          structured_text: string
          tenant_id: string
          updated_at?: string
          version: number
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          pins?: Json
          structured_text?: string
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          id: string
          plan_type: Database["public"]["Enums"]["subscription_plan"]
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end: string
          id?: string
          plan_type: Database["public"]["Enums"]["subscription_plan"]
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          id?: string
          plan_type?: Database["public"]["Enums"]["subscription_plan"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      voltai_feedback_votes: {
        Row: {
          corrected_components: Json | null
          correction_notes: string | null
          created_at: string
          id: string
          learning_log_id: string
          user_id: string
          vote_type: string
        }
        Insert: {
          corrected_components?: Json | null
          correction_notes?: string | null
          created_at?: string
          id?: string
          learning_log_id: string
          user_id: string
          vote_type: string
        }
        Update: {
          corrected_components?: Json | null
          correction_notes?: string | null
          created_at?: string
          id?: string
          learning_log_id?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: []
      }
      voltai_learning_logs: {
        Row: {
          corrections_applied: string[] | null
          created_at: string
          generation_id: string
          generation_time_ms: number | null
          id: string
          is_synthetic: boolean
          is_training_eligible: boolean
          overall_quality_score: number | null
          project_data: Json | null
          prompt: string
          prompt_complexity_score: number | null
          quality_completeness_score: number | null
          quality_compliance_score: number | null
          quality_layout_score: number | null
          quality_optimization_score: number | null
          repair_attempts: number
          system_data: Json
          tokens_used: number | null
          updated_at: string
          user_id: string
          validation_issues: Json | null
        }
        Insert: {
          corrections_applied?: string[] | null
          created_at?: string
          generation_id: string
          generation_time_ms?: number | null
          id?: string
          is_synthetic?: boolean
          is_training_eligible?: boolean
          overall_quality_score?: number | null
          project_data?: Json | null
          prompt: string
          prompt_complexity_score?: number | null
          quality_completeness_score?: number | null
          quality_compliance_score?: number | null
          quality_layout_score?: number | null
          quality_optimization_score?: number | null
          repair_attempts: number
          system_data?: Json
          tokens_used?: number | null
          updated_at?: string
          user_id: string
          validation_issues?: Json | null
        }
        Update: {
          corrections_applied?: string[] | null
          created_at?: string
          generation_id?: string
          generation_time_ms?: number | null
          id?: string
          is_synthetic?: boolean
          is_training_eligible?: boolean
          overall_quality_score?: number | null
          project_data?: Json | null
          prompt?: string
          prompt_complexity_score?: number | null
          quality_completeness_score?: number | null
          quality_compliance_score?: number | null
          quality_layout_score?: number | null
          quality_optimization_score?: number | null
          repair_attempts?: number
          system_data?: Json
          tokens_used?: number | null
          updated_at?: string
          user_id?: string
          validation_issues?: Json | null
        }
        Relationships: []
      }
      voltai_training_scenarios: {
        Row: {
          category: string
          complexity_level: number
          created_at: string
          expected_components: string[] | null
          expected_wires: string[] | null
          generation_count: number
          id: string
          is_active: boolean
          prompt_template: string
          success_rate: number | null
          validation_rules: Json | null
        }
        Insert: {
          category: string
          complexity_level: number
          created_at?: string
          expected_components?: string[] | null
          expected_wires?: string[] | null
          generation_count: number
          id?: string
          is_active?: boolean
          prompt_template: string
          success_rate?: number | null
          validation_rules?: Json | null
        }
        Update: {
          category?: string
          complexity_level?: number
          created_at?: string
          expected_components?: string[] | null
          expected_wires?: string[] | null
          generation_count?: number
          id?: string
          is_active?: boolean
          prompt_template?: string
          success_rate?: number | null
          validation_rules?: Json | null
        }
        Relationships: []
      }
      webhook_processing_ledger: {
        Row: {
          attempts: number
          event_id: string
          last_error: string | null
          locked_until: string | null
          payload_hash: string
          provider: string
          state: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          event_id: string
          last_error?: string | null
          locked_until?: string | null
          payload_hash: string
          provider: string
          state: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          event_id?: string
          last_error?: string | null
          locked_until?: string | null
          payload_hash?: string
          provider?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: Json }
      append_fleet_audit_event_atomic: {
        Args: {
          p_event_json: Json
          p_event_timestamp: number
          p_event_type: string
          p_gateway_id: string
          p_id: string
          p_organization_id: string
          p_plant_id: string
          p_previous_hash: string
          p_result: string
          p_schema_version: string
          p_severity: string
          p_tamper_proof_hash: string
        }
        Returns: {
          accepted: boolean
          current_tip_hash: string
          seq: number
        }[]
      }
      append_remote_config_monotonic_atomic: {
        Args: {
          p_config_version: number
          p_gateway_id: string
          p_organization_id: string
          p_payload: Json
          p_set_lkgc?: boolean
        }
        Returns: boolean
      }
      apply_mp_payment_transition_atomic: {
        Args: {
          p_amount_cents: number
          p_currency: string
          p_external_payment_id: string
          p_next_status: string
          p_plan: string
          p_tenant_id: string
        }
        Returns: {
          applied: boolean
          previous_status: string
          reason: string
        }[]
      }
      apply_tag_samples_partition_rls: {
        Args: { partition_table: unknown }
        Returns: undefined
      }
      begin_webhook_event_atomic: {
        Args: {
          p_event_id: string
          p_lease_ms?: number
          p_payload_hash: string
          p_provider: string
        }
        Returns: {
          attempts: number
          event_id: string
          last_error: string
          lease_status: string
          locked_until: string
          payload_hash: string
          provider: string
          state: string
          updated_at: string
        }[]
      }
      bootstrap_personal_tenant_if_missing: { Args: never; Returns: string }
      change_tenant_plan: { Args: { p_plan: string }; Returns: Json }
      check_ai_quota: {
        Args: never
        Returns: {
          allowed: boolean
          max_tokens: number
          plan: string
          tenant_id: string
          used: number
        }[]
      }
      check_ai_quota_for_user: {
        Args: { p_user_id: string }
        Returns: {
          allowed: boolean
          max_tokens: number
          plan: string
          tenant_id: string
          used: number
        }[]
      }
      claim_provisioning_token_atomic: {
        Args: {
          p_auth_token_digest: string
          p_consumed_at: string
          p_gateway_id: string
          p_gateway_payload: Json
          p_organization_id: string
          p_plant_id: string
          p_station_id: string
          p_station_key: string
          p_token_hash: string
          p_updated_token_payload: Json
        }
        Returns: {
          claimed: boolean
          reason: string
        }[]
      }
      complete_webhook_event_atomic: {
        Args: {
          p_event_id: string
          p_last_error?: string
          p_provider: string
          p_state: string
        }
        Returns: undefined
      }
      consume_ai_credits: { Args: { p_operation: string }; Returns: Json }
      consume_ai_credits_for_user: {
        Args: { p_operation: string; p_user_id: string }
        Returns: Json
      }
      expire_overdue_subscriptions: { Args: never; Returns: number }
      generate_bom_from_canvas: {
        Args: { p_project_id: string }
        Returns: {
          items_added: number
        }[]
      }
      generate_bom_from_canvas_for_user: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: {
          items_added: number
        }[]
      }
      get_ai_credits_remaining: {
        Args: never
        Returns: {
          max_credits: number
          plan: string
          remaining: number
          unlimited: boolean
          used: number
        }[]
      }
      get_ai_credits_remaining_for_user: {
        Args: { p_user_id: string }
        Returns: {
          max_credits: number
          plan: string
          remaining: number
          unlimited: boolean
          used: number
        }[]
      }
      get_user_role: { Args: never; Returns: string }
      get_user_tenant_id: { Args: never; Returns: string }
      increment_ai_tokens: { Args: { p_tokens: number }; Returns: undefined }
      increment_ai_tokens_for_user: {
        Args: { p_tokens: number; p_user_id: string }
        Returns: undefined
      }
      ingest_bench_telemetry: {
        Args: {
          p_device_external_id: string
          p_device_name: string
          p_metadata?: Json
          p_readings: Json
          p_user_id: string
        }
        Returns: Json
      }
      ingest_iot_reading: {
        Args: {
          p_api_key: string
          p_device_external_id: string
          p_message_id?: string
          p_quality?: string
          p_ttl_ms?: number
          p_value: number
        }
        Returns: Json
      }
      iot_acknowledge_alert: { Args: { p_alert_id: string }; Returns: Json }
      iot_enqueue_command: {
        Args: {
          p_command: string
          p_device_external_id: string
          p_payload?: Json
          p_watchdog_ms?: number
        }
        Returns: Json
      }
      is_platform_admin: { Args: never; Returns: boolean }
      notify_schema_change: { Args: never; Returns: undefined }
      platform_monthly_metrics: { Args: { p_months?: number }; Returns: Json }
      record_ingested_batch_atomic: {
        Args: {
          p_dedup_keys: string[]
          p_expected_min_sequence: number
          p_gateway_id: string
          p_new_sequence: number
          p_organization_id: string
          p_plant_id: string
          p_samples: Json
        }
        Returns: {
          committed: boolean
          reason: string
        }[]
      }
      try_parse_tenant_uuid: { Args: { p_org_id: string }; Returns: string }
    }
    Enums: {
      alarm_category: "process" | "equipment" | "safety" | "communication"
      alarm_severity: "critical" | "high" | "medium" | "low" | "info"
      alarm_state: "active" | "acknowledged" | "cleared" | "suppressed"
      alert_level: "critical" | "warning" | "info"
      client_status: "active" | "prospect" | "inactive"
      iot_command_state:
        | "PENDING"
        | "DELIVERED"
        | "ACKED"
        | "EXECUTED"
        | "FAILED"
        | "TIMED_OUT"
      sensor_kind: "temperature" | "pressure" | "current" | "vibration" | "flow"
      simulation_tag_data_type: "BOOL" | "INT" | "REAL"
      subscription_plan: "FREE" | "PRO" | "INDUSTRIAL"
      subscription_status: "active" | "canceled" | "expired" | "trialing"
      template_category:
        | "conveyor"
        | "pumping"
        | "exhaust"
        | "panel"
        | "hvac"
        | "tank_farm"
        | "custom"
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
      alarm_category: ["process", "equipment", "safety", "communication"],
      alarm_severity: ["critical", "high", "medium", "low", "info"],
      alarm_state: ["active", "acknowledged", "cleared", "suppressed"],
      alert_level: ["critical", "warning", "info"],
      client_status: ["active", "prospect", "inactive"],
      iot_command_state: [
        "PENDING",
        "DELIVERED",
        "ACKED",
        "EXECUTED",
        "FAILED",
        "TIMED_OUT",
      ],
      sensor_kind: ["temperature", "pressure", "current", "vibration", "flow"],
      simulation_tag_data_type: ["BOOL", "INT", "REAL"],
      subscription_plan: ["FREE", "PRO", "INDUSTRIAL"],
      subscription_status: ["active", "canceled", "expired", "trialing"],
      template_category: [
        "conveyor",
        "pumping",
        "exhaust",
        "panel",
        "hvac",
        "tank_farm",
        "custom",
      ],
    },
  },
} as const
