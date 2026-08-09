export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<{
        id: string;
        email: string;
        full_name: string | null;
        email_verified_at: string | null;
        account_status: string;
        platform_role: string;
        created_at: string;
        updated_at: string;
      }>;
      organizations: Table<{
        id: number;
        public_id: string;
        display_name: string;
        legal_name: string | null;
        category: string;
        status: string;
        accepted_policy_version_id: number | null;
        billing_profile: Json;
        created_at: string;
        updated_at: string;
      }>;
      organization_memberships: Table<{
        organization_id: number;
        user_id: string;
        role: string;
        status: string;
        invited_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      locations: Table<{
        id: number;
        public_id: string;
        organization_id: number;
        name: string;
        address: string | null;
        zone: string;
        category: string;
        operating_hours: Json;
        category_exclusions: Json;
        traffic_band: string | null;
        quality_score: number;
        status: string;
        created_at: string;
        updated_at: string;
      }>;
      devices: Table<{
        id: number;
        public_id: string;
        location_id: number;
        name: string;
        activation_status: string;
        key_fingerprint: string | null;
        app_version: string | null;
        capabilities: Json;
        current_manifest_version: number | null;
        last_heartbeat_at: string | null;
        risk_state: string;
        suspension_reason: string | null;
        created_at: string;
        updated_at: string;
      }>;
      media_assets: Table<{
        id: number;
        public_id: string;
        organization_id: number;
        name: string;
        original_storage_path: string | null;
        normalized_storage_path: string | null;
        thumbnail_storage_path: string | null;
        duration_ms: number | null;
        width: number | null;
        height: number | null;
        codec: string | null;
        checksum_sha256: string | null;
        moderation_status: string;
        rights_declared_at: string | null;
        rejection_reason: string | null;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      campaigns: Table<{
        id: number;
        public_id: string;
        organization_id: number;
        media_asset_id: number;
        policy_version_id: number;
        name: string;
        status: string;
        starts_at: string;
        ends_at: string;
        budget_credits: number;
        spent_credits: number;
        daily_cap_credits: number | null;
        frequency_cap_per_day: number | null;
        targeting: Json;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      wallets: Table<{
        id: number;
        organization_id: number | null;
        wallet_type: string;
        balance_projection: number;
        created_at: string;
        updated_at: string;
      }>;
      policy_versions: Table<{
        id: number;
        code: string;
        rules: Json;
        effective_at: string;
        superseded_at: string | null;
        created_at: string;
      }>;
      audit_logs: Table<{
        id: number;
        organization_id: number | null;
        actor_user_id: string | null;
        action: string;
        object_type: string;
        object_id: string;
        reason: string | null;
        before_summary: Json | null;
        after_summary: Json | null;
        request_context: Json;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      admin_create_organization: {
        Args: {
          p_display_name: string;
          p_legal_name: string;
          p_category: string;
          p_owner_user_id: string;
          p_reason: string;
        };
        Returns: number;
      };
      create_location: {
        Args: {
          p_organization_id: number;
          p_name: string;
          p_address: string;
          p_zone: string;
          p_category: string;
          p_traffic_band: string;
          p_operating_hours: Json;
        };
        Returns: number;
      };
      admin_update_organization: {
        Args: {
          p_organization_id: number;
          p_display_name: string;
          p_legal_name: string;
          p_category: string;
          p_status: string;
          p_reason: string;
        };
        Returns: undefined;
      };
      update_location: {
        Args: {
          p_location_id: number;
          p_organization_id: number;
          p_name: string;
          p_address: string;
          p_zone: string;
          p_category: string;
          p_traffic_band: string;
          p_operating_hours: Json;
          p_category_exclusions: Json;
          p_status: string;
          p_reason: string;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
