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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      benchmark_prices: {
        Row: {
          avg_price: number
          category: string
          country: string
          created_at: string
          currency: string
          description: string
          id: string
          max_price: number | null
          min_price: number | null
          source: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          avg_price: number
          category: string
          country: string
          created_at?: string
          currency: string
          description: string
          id?: string
          max_price?: number | null
          min_price?: number | null
          source?: string | null
          unit: string
          updated_at?: string
        }
        Update: {
          avg_price?: number
          category?: string
          country?: string
          created_at?: string
          currency?: string
          description?: string
          id?: string
          max_price?: number | null
          min_price?: number | null
          source?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      cost_items: {
        Row: {
          ai_comment: string | null
          benchmark_max: number | null
          benchmark_min: number | null
          benchmark_typical: number | null
          clarification_question: string | null
          created_at: string
          id: string
          interpreted_scope: string | null
          match_confidence: number | null
          match_reasoning: string | null
          matched_benchmark_id: string | null
          original_description: string
          original_unit_price: number | null
          price_source: string | null
          project_id: string
          quantity: number
          recommended_unit_price: number | null
          sheet_name: string | null
          status: string
          total_price: number | null
          trade: string | null
          unit: string
          updated_at: string
          user_clarification: string | null
          user_override_price: number | null
        }
        Insert: {
          ai_comment?: string | null
          benchmark_max?: number | null
          benchmark_min?: number | null
          benchmark_typical?: number | null
          clarification_question?: string | null
          created_at?: string
          id?: string
          interpreted_scope?: string | null
          match_confidence?: number | null
          match_reasoning?: string | null
          matched_benchmark_id?: string | null
          original_description: string
          original_unit_price?: number | null
          price_source?: string | null
          project_id: string
          quantity?: number
          recommended_unit_price?: number | null
          sheet_name?: string | null
          status?: string
          total_price?: number | null
          trade?: string | null
          unit: string
          updated_at?: string
          user_clarification?: string | null
          user_override_price?: number | null
        }
        Update: {
          ai_comment?: string | null
          benchmark_max?: number | null
          benchmark_min?: number | null
          benchmark_typical?: number | null
          clarification_question?: string | null
          created_at?: string
          id?: string
          interpreted_scope?: string | null
          match_confidence?: number | null
          match_reasoning?: string | null
          matched_benchmark_id?: string | null
          original_description?: string
          original_unit_price?: number | null
          price_source?: string | null
          project_id?: string
          quantity?: number
          recommended_unit_price?: number | null
          sheet_name?: string | null
          status?: string
          total_price?: number | null
          trade?: string | null
          unit?: string
          updated_at?: string
          user_clarification?: string | null
          user_override_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_items_matched_benchmark_id_fkey"
            columns: ["matched_benchmark_id"]
            isOneToOne: false
            referencedRelation: "benchmark_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          country: string
          created_at: string
          currency: string
          id: string
          issues_count: number | null
          name: string
          notes: string | null
          project_notes: string | null
          project_type: string
          status: string
          total_items: number | null
          total_value: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          country: string
          created_at?: string
          currency: string
          id?: string
          issues_count?: number | null
          name: string
          notes?: string | null
          project_notes?: string | null
          project_type: string
          status?: string
          total_items?: number | null
          total_value?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          country?: string
          created_at?: string
          currency?: string
          id?: string
          issues_count?: number | null
          name?: string
          notes?: string | null
          project_notes?: string | null
          project_type?: string
          status?: string
          total_items?: number | null
          total_value?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      uploaded_files: {
        Row: {
          created_at: string
          error_message: string | null
          file_name: string
          file_size: number
          file_type: string
          id: string
          project_id: string
          status: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          file_name: string
          file_size: number
          file_type: string
          id?: string
          project_id: string
          status?: string
          storage_path: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          id?: string
          project_id?: string
          status?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "uploaded_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
