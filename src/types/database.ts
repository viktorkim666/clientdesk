export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      ai_draft_requests: {
        Row: {
          created_at: string;
          id: string;
          project_id: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          project_id: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          project_id?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_draft_requests_project_id_workspace_id_fkey";
            columns: ["project_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "ai_draft_requests_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          client_id: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          role: Database["public"]["Enums"]["workspace_role"];
          token_hash: string;
          workspace_id: string;
        };
        Insert: {
          accepted_at?: string | null;
          client_id?: string | null;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          invited_by?: string | null;
          role: Database["public"]["Enums"]["workspace_role"];
          token_hash: string;
          workspace_id: string;
        };
        Update: {
          accepted_at?: string | null;
          client_id?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          role?: Database["public"]["Enums"]["workspace_role"];
          token_hash?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_client_id_workspace_id_fkey";
            columns: ["client_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "invitations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      project_files: {
        Row: {
          created_at: string;
          id: string;
          mime_type: string;
          name: string;
          project_id: string;
          size_bytes: number;
          storage_path: string;
          uploaded_by: string | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mime_type: string;
          name: string;
          project_id: string;
          size_bytes: number;
          storage_path: string;
          uploaded_by?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mime_type?: string;
          name?: string;
          project_id?: string;
          size_bytes?: number;
          storage_path?: string;
          uploaded_by?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_workspace_id_fkey";
            columns: ["project_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "project_files_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      project_updates: {
        Row: {
          author_id: string | null;
          body: string;
          created_at: string;
          id: string;
          project_id: string;
          workspace_id: string;
        };
        Insert: {
          author_id?: string | null;
          body: string;
          created_at?: string;
          id?: string;
          project_id: string;
          workspace_id: string;
        };
        Update: {
          author_id?: string | null;
          body?: string;
          created_at?: string;
          id?: string;
          project_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_updates_project_id_workspace_id_fkey";
            columns: ["project_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "project_updates_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          client_id: string;
          created_at: string;
          id: string;
          name: string;
          status: Database["public"]["Enums"]["project_status"];
          workspace_id: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          id?: string;
          name: string;
          status?: Database["public"]["Enums"]["project_status"];
          workspace_id: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          status?: Database["public"]["Enums"]["project_status"];
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_client_id_workspace_id_fkey";
            columns: ["client_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "projects_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      update_comments: {
        Row: {
          author_id: string | null;
          body: string;
          created_at: string;
          id: string;
          project_id: string;
          update_id: string;
          workspace_id: string;
        };
        Insert: {
          author_id?: string | null;
          body: string;
          created_at?: string;
          id?: string;
          project_id: string;
          update_id: string;
          workspace_id: string;
        };
        Update: {
          author_id?: string | null;
          body?: string;
          created_at?: string;
          id?: string;
          project_id?: string;
          update_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "update_comments_project_id_workspace_id_fkey";
            columns: ["project_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "update_comments_update_id_project_id_fkey";
            columns: ["update_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "project_updates";
            referencedColumns: ["id", "project_id"];
          },
          {
            foreignKeyName: "update_comments_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_billing: {
        Row: {
          cancel_at: string | null;
          current_period_end: string | null;
          price_id: string | null;
          stripe_customer_id: string;
          stripe_subscription_id: string | null;
          subscription_status: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          cancel_at?: string | null;
          current_period_end?: string | null;
          price_id?: string | null;
          stripe_customer_id: string;
          stripe_subscription_id?: string | null;
          subscription_status?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          cancel_at?: string | null;
          current_period_end?: string | null;
          price_id?: string | null;
          stripe_customer_id?: string;
          stripe_subscription_id?: string | null;
          subscription_status?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_billing_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: true;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_members: {
        Row: {
          client_id: string | null;
          created_at: string;
          role: Database["public"]["Enums"]["workspace_role"];
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          role: Database["public"]["Enums"]["workspace_role"];
          user_id: string;
          workspace_id: string;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          role?: Database["public"]["Enums"]["workspace_role"];
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_members_client_id_workspace_id_fkey";
            columns: ["client_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "workspace_members_user_id_profiles_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          slug: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: {
        Args: { p_token: string };
        Returns: {
          client_id: string | null;
          created_at: string;
          role: Database["public"]["Enums"]["workspace_role"];
          user_id: string;
          workspace_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "workspace_members";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      claim_ai_draft: { Args: { p_project_id: string }; Returns: string };
      create_workspace: {
        Args: { p_name: string };
        Returns: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          slug: string;
        };
        SetofOptions: {
          from: "*";
          to: "workspaces";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      project_update_recipients: {
        Args: { p_project_id: string };
        Returns: string[];
      };
    };
    Enums: {
      project_status: "active" | "on_hold" | "done";
      workspace_role: "owner" | "member" | "client";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      project_status: ["active", "on_hold", "done"],
      workspace_role: ["owner", "member", "client"],
    },
  },
} as const;
