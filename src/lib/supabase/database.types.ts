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
        website_url: string | null;
        contact_email: string | null;
        contact_phone: string | null;
        logo_storage_path: string | null;
        logo_position: string;
        logo_size_percent: number;
        stream_access_code: string;
        stream_access_code_expires_at: string;
        stream_earning_enabled: boolean;
        stream_earning_rate: number;
        ad_consumption_rate: number;
        operating_start_date: string | null;
        operating_end_date: string | null;
        operating_days: string[];
        operating_opens_at: string;
        operating_closes_at: string;
        operating_time_zone: string;
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
      device_observations: Table<{
        id: number;
        device_id: number;
        organization_id: number;
        observed_ip: string | null;
        user_agent: string | null;
        device_type: string | null;
        os_name: string | null;
        browser_name: string | null;
        locale: string | null;
        timezone: string | null;
        screen_width: number | null;
        screen_height: number | null;
        device_pixel_ratio: number | null;
        connection_type: string | null;
        country_code: string | null;
        edge_colo: string | null;
        client_info: Json;
        observed_at: string;
      }>;
      media_assets: Table<{
        id: number;
        public_id: string;
        organization_id: number;
        name: string;
        source_type: string;
        external_provider: string | null;
        external_id: string | null;
        external_url: string | null;
        original_storage_path: string | null;
        normalized_storage_path: string | null;
        thumbnail_storage_path: string | null;
        hls_master_storage_path: string | null;
        hls_renditions: Json;
        duration_ms: number | null;
        width: number | null;
        height: number | null;
        codec: string | null;
        checksum_sha256: string | null;
        original_filename: string | null;
        mime_type: string | null;
        file_size_bytes: number | null;
        normalized_file_size_bytes: number | null;
        technical_metadata: Json;
        moderation_status: string;
        processing_status: string;
        processing_error: string | null;
        processing_completed_at: string | null;
        compress_video: boolean;
        auto_approve_after_processing: boolean;
        rights_declared_at: string | null;
        rejection_reason: string | null;
        submitted_at: string | null;
        moderated_at: string | null;
        moderated_by: string | null;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      media_processing_jobs: Table<{
        id: number;
        public_id: string;
        media_asset_id: number;
        source_checksum_sha256: string;
        status: string;
        attempts: number;
        max_attempts: number;
        available_at: string;
        locked_at: string | null;
        locked_by: string | null;
        last_error: string | null;
        started_at: string | null;
        completed_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      streaming_channels: Table<{
        id: number;
        public_id: string;
        access_key: string;
        custom_hostname: string | null;
        name: string;
        slug: string;
        description: string | null;
        status: string;
        broadcast_enabled: boolean;
        broadcast_started_at: string;
        show_live_badge: boolean;
        show_channel_name: boolean;
        show_now_playing: boolean;
        show_audio_control: boolean;
        show_advertiser_logo: boolean;
        show_stripe_banner: boolean;
        show_video_time: boolean;
        show_fullscreen_control: boolean;
        show_leave_control: boolean;
        show_viewer_login: boolean;
        show_channel_description: boolean;
        show_progress_bar: boolean;
        stripe_banner_text: string | null;
        stripe_banner_position: string;
        video_fit: string;
        overlay_position: string;
        overlay_style: string;
        accent_color: string;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      streaming_channel_organizations: Table<{
        channel_id: number;
        organization_id: number;
        assigned_by: string | null;
        created_at: string;
      }>;
      streaming_channel_items: Table<{
        id: number;
        channel_id: number;
        media_asset_id: number;
        position: number;
        status: string;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      organization_busy_periods: Table<{
        id: number;
        organization_id: number;
        day_of_week: string;
        starts_at: string;
        ends_at: string;
        consumption_multiplier: number;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      stream_viewer_sessions: Table<{
        id: string;
        channel_id: number;
        host_organization_id: number | null;
        token_hash: string;
        viewer_mode: string;
        viewer_user_id: string | null;
        viewer_name: string | null;
        viewer_email: string | null;
        ip_hash: string | null;
        user_agent: string | null;
        country_code: string | null;
        region_code: string | null;
        city: string | null;
        edge_colo: string | null;
        created_at: string;
        consented_at: string;
        last_activity_at: string;
        last_credit_at: string | null;
        retention_expires_at: string;
        personal_data_purged_at: string | null;
        last_media_asset_id: number | null;
        last_position_seconds: number | null;
        last_client_event_at: string | null;
        expires_at: string;
        ended_at: string | null;
      }>;
      stream_access_attempts: Table<{
        id: number;
        ip_hash: string;
        channel_public_id: string | null;
        succeeded: boolean;
        attempted_at: string;
      }>;
      stream_credit_events: Table<{
        id: number;
        event_key: string;
        viewer_session_id: string;
        media_asset_id: number;
        host_organization_id: number | null;
        advertiser_organization_id: number;
        verified_seconds: number;
        earned_credits: number;
        consumed_credits: number;
        ledger_transaction_id: number | null;
        validation_result: string;
        reason_codes: string[];
        playback_position_seconds: number | null;
        client_event_at: string | null;
        evidence: Json;
        created_at: string;
      }>;
      stream_quality_events: Table<{
        id: number;
        event_key: string;
        viewer_session_id: string;
        channel_id: number;
        media_public_id: string;
        playback_type: string;
        observed_interval_ms: number;
        startup_ms: number | null;
        buffer_count: number;
        buffer_duration_ms: number;
        heartbeat_rtt_ms: number | null;
        connection_rtt_ms: number | null;
        downlink_mbps: number | null;
        effective_connection_type: string | null;
        dropped_frames: number | null;
        total_frames: number | null;
        created_at: string;
      }>;
      stream_access_code_rotations: Table<{
        id: number;
        organization_id: number;
        previous_code_hash: string;
        rotated_by: string | null;
        rotated_at: string;
        expires_at: string;
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
      campaign_target_organizations: Table<{
        id: number;
        campaign_id: number;
        organization_id: number;
        created_by: string | null;
        created_at: string;
      }>;
      campaign_target_locations: Table<{
        id: number;
        campaign_id: number;
        location_id: number;
        created_by: string | null;
        created_at: string;
      }>;
      playback_sessions: Table<{
        id: number;
        playback_id: string;
        device_id: number;
        campaign_id: number;
        media_asset_id: number;
        advertiser_organization_id: number;
        host_organization_id: number;
        policy_version_id: number;
        manifest_id: string;
        assignment_nonce: string;
        started_at: string | null;
        completed_at: string | null;
        verified_seconds: number;
        validation_result: string;
        confidence_score: number | null;
        reason_codes: string[];
        settled_ledger_transaction_id: number | null;
        created_at: string;
      }>;
      wallets: Table<{
        id: number;
        organization_id: number | null;
        wallet_type: string;
        balance_projection: number;
        created_at: string;
        updated_at: string;
      }>;
      ledger_transactions: Table<{
        id: number;
        public_id: string;
        transaction_type: string;
        reference_type: string;
        reference_id: string;
        policy_version_id: number | null;
        idempotency_key: string;
        status: string;
        reversal_of_id: number | null;
        created_by: string | null;
        reason: string | null;
        created_at: string;
      }>;
      ledger_entries: Table<{
        id: number;
        transaction_id: number;
        wallet_id: number;
        amount: number;
        description: string;
        created_at: string;
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
      user_activity_sessions: Table<{
        session_id: string;
        user_id: string;
        first_seen_at: string;
        last_seen_at: string;
        last_path: string | null;
        ip_address: string | null;
        user_agent: string | null;
        country_code: string | null;
        edge_colo: string | null;
        revoked_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      admin_grant_business_credits: {
        Args: { p_organization_id: number; p_amount: number; p_reason: string };
        Returns: number;
      };
      get_admin_wallet_report: {
        Args: { p_organization_id?: number | null; p_history_limit?: number };
        Returns: Json;
      };
      admin_clear_demo_data: {
        Args: { p_confirmation: string };
        Returns: number;
      };
      create_campaign_draft: {
        Args: {
          p_name: string;
          p_media_asset_id: number;
          p_starts_at: string;
          p_ends_at: string;
          p_budget_credits: number;
          p_daily_cap_credits: number | null;
          p_frequency_cap_per_day: number | null;
          p_target_organization_ids: number[];
        };
        Returns: string;
      };
      create_campaign_draft_for_organization: {
        Args: {
          p_organization_id: number;
          p_name: string;
          p_media_asset_id: number;
          p_starts_at: string;
          p_ends_at: string;
          p_budget_credits: number;
          p_daily_cap_credits: number | null;
          p_frequency_cap_per_day: number | null;
          p_target_organization_ids: number[];
        };
        Returns: string;
      };
      create_and_publish_campaign: {
        Args: {
          p_organization_id: number;
          p_name: string;
          p_media_asset_id: number;
          p_starts_at: string;
          p_ends_at: string;
          p_budget_credits: number;
          p_target_location_ids: number[];
        };
        Returns: string;
      };
      update_and_publish_campaign: {
        Args: {
          p_campaign_public_id: string;
          p_name: string;
          p_media_asset_id: number;
          p_starts_at: string;
          p_ends_at: string;
          p_budget_credits: number;
          p_target_location_ids: number[];
        };
        Returns: string;
      };
      update_campaign_draft: {
        Args: {
          p_campaign_public_id: string;
          p_name: string;
          p_media_asset_id: number;
          p_starts_at: string;
          p_ends_at: string;
          p_budget_credits: number;
          p_daily_cap_credits: number | null;
          p_frequency_cap_per_day: number | null;
          p_target_organization_ids: number[];
        };
        Returns: undefined;
      };
      delete_campaign_draft: {
        Args: { p_campaign_public_id: string };
        Returns: undefined;
      };
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
      admin_create_business: {
        Args: {
          p_display_name: string;
          p_legal_name: string;
          p_category: string;
          p_reason: string;
        };
        Returns: number;
      };
      admin_finalize_platform_invite: {
        Args: { p_user_id: string; p_full_name: string; p_platform_role: string; p_reason: string };
        Returns: undefined;
      };
      admin_update_platform_user_access: {
        Args: { p_user_id: string; p_account_status: string; p_reason: string };
        Returns: undefined;
      };
      admin_finalize_user_invite: {
        Args: { p_user_id: string; p_full_name: string; p_reason: string };
        Returns: undefined;
      };
      admin_update_user_access: {
        Args: {
          p_user_id: string;
          p_account_status: string;
          p_membership_role: string | null;
          p_reason: string;
        };
        Returns: undefined;
      };
      record_user_activity: {
        Args: {
          p_path: string;
          p_ip: string;
          p_user_agent: string;
          p_country_code: string;
          p_edge_colo: string;
        };
        Returns: boolean;
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
      admin_update_organization_profile: {
        Args: {
          p_organization_id: number;
          p_display_name: string;
          p_legal_name: string;
          p_category: string;
          p_status: string;
          p_website_url: string;
          p_contact_email: string;
          p_contact_phone: string;
          p_logo_position: string;
          p_logo_size_percent: number;
          p_reason: string;
        };
        Returns: undefined;
      };
      admin_update_business_profile: {
        Args: {
          p_organization_id: number;
          p_display_name: string;
          p_legal_name: string;
          p_category: string;
          p_status: string;
          p_website_url: string;
          p_contact_email: string;
          p_contact_phone: string;
          p_logo_position: string;
          p_logo_size_percent: number;
          p_operating_start_date: string | null;
          p_operating_end_date: string | null;
          p_operating_days: string[];
          p_operating_opens_at: string;
          p_operating_closes_at: string;
          p_operating_time_zone: string;
          p_reason: string;
        };
        Returns: undefined;
      };
      admin_set_organization_logo: {
        Args: { p_organization_id: number; p_logo_storage_path: string | null };
        Returns: string | null;
      };
      admin_assign_business_ad_to_channel: {
        Args: { p_organization_id: number; p_channel_id: number; p_media_asset_id: number };
        Returns: number;
      };
      admin_remove_business_ad_from_channel: {
        Args: { p_organization_id: number; p_channel_item_id: number };
        Returns: undefined;
      };
      update_stream_credit_settings: {
        Args: {
          p_organization_id: number;
          p_earning_enabled: boolean;
          p_earning_rate: number;
          p_consumption_rate: number;
        };
        Returns: undefined;
      };
      admin_replace_business_busy_periods: {
        Args: {
          p_organization_id: number;
          p_periods: Json;
          p_reason: string;
        };
        Returns: undefined;
      };
      regenerate_stream_access_code: {
        Args: { p_organization_id: number };
        Returns: string;
      };
      record_stream_viewer_heartbeat: {
        Args: { p_session_id: string; p_media_public_id: string; p_event_key: string };
        Returns: Array<{ verified_seconds: number; earned_credits: number; consumed_credits: number }>;
      };
      record_stream_viewer_heartbeat_v2: {
        Args: {
          p_session_id: string;
          p_media_public_id: string;
          p_event_key: string;
          p_playback_position_seconds: number;
          p_client_event_at: string;
          p_page_visible: boolean;
          p_is_playing: boolean;
        };
        Returns: Array<{ validation_result: string; verified_seconds: number; earned_credits: number; consumed_credits: number; reason_codes: string[] }>;
      };
      purge_expired_stream_viewer_data: {
        Args: Record<string, never>;
        Returns: Array<{ sessions_anonymized: number; attempts_deleted: number }>;
      };
      get_stream_report_summary: {
        Args: { p_organization_id: number };
        Returns: Json;
      };
      get_stream_monitor_snapshot: {
        Args: { p_window_hours: number };
        Returns: Json;
      };
      get_stream_quality_snapshot: {
        Args: { p_window_hours?: number };
        Returns: Json;
      };
      admin_handle_stream_channel: {
        Args: { p_channel_id: number; p_action: string; p_reason: string };
        Returns: undefined;
      };
      admin_end_stream_viewer_session: {
        Args: { p_session_id: string; p_reason: string };
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
      request_device_activation: {
        Args: {
          p_code: string;
          p_credential_token: string;
          p_public_key_jwk: Json;
          p_key_fingerprint: string;
          p_device_info: Json;
          p_ip: string;
          p_user_agent: string;
          p_country_code: string;
          p_edge_colo: string;
        };
        Returns: Array<{ activation_id: string; expires_at: string }>;
      };
      device_activation_status: {
        Args: { p_activation_id: string; p_credential_token: string };
        Returns: Array<{ status: string; device_public_id: string | null; heartbeat_interval_seconds: number }>;
      };
      claim_device_activation: {
        Args: { p_code: string; p_location_id: number; p_name: string; p_reason: string };
        Returns: string;
      };
      record_device_heartbeat: {
        Args: {
          p_device_public_id: string;
          p_credential_token: string;
          p_client_info: Json;
          p_ip: string;
          p_user_agent: string;
          p_country_code: string;
          p_edge_colo: string;
        };
        Returns: string;
      };
      suspend_device: {
        Args: { p_device_public_id: string; p_reason: string };
        Returns: undefined;
      };
      create_media_upload: {
        Args: {
          p_organization_id: number;
          p_name: string;
          p_original_filename: string;
          p_mime_type: string;
          p_file_size_bytes: number;
        };
        Returns: Array<{ asset_public_id: string; storage_path: string }>;
      };
      cancel_media_upload: {
        Args: { p_asset_public_id: string };
        Returns: undefined;
      };
      prepare_media_asset_deletion: {
        Args: { p_asset_public_id: string };
        Returns: string[];
      };
      delete_media_asset: {
        Args: { p_asset_public_id: string };
        Returns: undefined;
      };
      create_youtube_media: {
        Args: {
          p_organization_id: number;
          p_name: string;
          p_youtube_video_id: string;
          p_duration_ms: number;
        };
        Returns: string;
      };
      submit_media_upload: {
        Args: {
          p_asset_public_id: string;
          p_duration_ms: number;
          p_width: number;
          p_height: number;
          p_codec: string;
          p_checksum_sha256: string;
          p_compress_video: boolean;
          p_technical_metadata: Json;
        };
        Returns: undefined;
      };
      moderate_media_asset: {
        Args: { p_asset_public_id: string; p_decision: string; p_reason: string };
        Returns: undefined;
      };
      claim_media_processing_job: {
        Args: { p_worker_id: string };
        Returns: Array<{
          job_public_id: string;
          asset_public_id: string;
          organization_public_id: string;
          original_storage_path: string;
          source_checksum_sha256: string;
          expected_duration_ms: number | null;
          expected_width: number | null;
          expected_height: number | null;
          attempt: number;
        }>;
      };
      complete_media_processing_job: {
        Args: {
          p_job_public_id: string;
          p_worker_id: string;
          p_normalized_storage_path: string;
          p_thumbnail_storage_path: string;
          p_normalized_file_size_bytes: number;
          p_duration_ms: number;
          p_width: number;
          p_height: number;
          p_codec: string;
          p_processing_metadata: Json;
        };
        Returns: undefined;
      };
      complete_media_processing_job_v2: {
        Args: {
          p_job_public_id: string;
          p_worker_id: string;
          p_normalized_storage_path: string;
          p_thumbnail_storage_path: string;
          p_hls_master_storage_path: string;
          p_hls_renditions: Json;
          p_normalized_file_size_bytes: number;
          p_duration_ms: number;
          p_width: number;
          p_height: number;
          p_codec: string;
          p_processing_metadata: Json;
        };
        Returns: undefined;
      };
      fail_media_processing_job: {
        Args: { p_job_public_id: string; p_worker_id: string; p_error: string };
        Returns: boolean;
      };
      resolve_stream_hostname: {
        Args: { p_hostname: string };
        Returns: Array<{ channel_public_id: string; channel_access_key: string }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
