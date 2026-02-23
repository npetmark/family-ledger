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
      accounts: {
        Row: {
          account_type: string
          created_at: string
          currency: string
          icon: string
          id: string
          is_visible: boolean
          name: string
          sort_order: number
          starting_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type?: string
          created_at?: string
          currency?: string
          icon?: string
          id?: string
          is_visible?: boolean
          name: string
          sort_order?: number
          starting_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string
          created_at?: string
          currency?: string
          icon?: string
          id?: string
          is_visible?: boolean
          name?: string
          sort_order?: number
          starting_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          alert_threshold: number
          amount: number
          created_at: string
          id: string
          month_year: string
          subcategory_id: string
          user_id: string
        }
        Insert: {
          alert_threshold?: number
          amount?: number
          created_at?: string
          id?: string
          month_year: string
          subcategory_id: string
          user_id: string
        }
        Update: {
          alert_threshold?: number
          amount?: number
          created_at?: string
          id?: string
          month_year?: string
          subcategory_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      main_categories: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          currency: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          display_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      recurring_transactions: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          end_date: string | null
          frequency: string
          id: string
          is_active: boolean
          next_due_date: string
          note: string | null
          start_date: string
          subcategory_id: string | null
          tags: string[] | null
          transaction_type: string
          transfer_to_account_id: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          next_due_date?: string
          note?: string | null
          start_date?: string
          subcategory_id?: string | null
          tags?: string[] | null
          transaction_type?: string
          transfer_to_account_id?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          next_due_date?: string
          note?: string | null
          start_date?: string
          subcategory_id?: string | null
          tags?: string[] | null
          transaction_type?: string
          transfer_to_account_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_transfer_to_account_id_fkey"
            columns: ["transfer_to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategories: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          is_active: boolean
          main_category_id: string
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          main_category_id: string
          name: string
          sort_order?: number
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          main_category_id?: string
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_main_category_id_fkey"
            columns: ["main_category_id"]
            isOneToOne: false
            referencedRelation: "main_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_templates: {
        Row: {
          account_id: string | null
          amount: number | null
          created_at: string
          id: string
          name: string
          note: string | null
          subcategory_id: string | null
          tags: string[] | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount?: number | null
          created_at?: string
          id?: string
          name: string
          note?: string | null
          subcategory_id?: string | null
          tags?: string[] | null
          transaction_type?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number | null
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          subcategory_id?: string | null
          tags?: string[] | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_templates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_templates_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          date: string
          id: string
          note: string | null
          recurring_transaction_id: string | null
          subcategory_id: string | null
          tags: string[] | null
          transaction_type: string
          transfer_to_account_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          recurring_transaction_id?: string | null
          subcategory_id?: string | null
          tags?: string[] | null
          transaction_type?: string
          transfer_to_account_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          recurring_transaction_id?: string | null
          subcategory_id?: string | null
          tags?: string[] | null
          transaction_type?: string
          transfer_to_account_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transfer_to_account_id_fkey"
            columns: ["transfer_to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
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
    Enums: {},
  },
} as const
