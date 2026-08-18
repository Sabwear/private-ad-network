alter table public.streaming_channels
  add column if not exists show_fullscreen_control boolean not null default true,
  add column if not exists show_leave_control boolean not null default true,
  add column if not exists show_viewer_login boolean not null default true,
  add column if not exists show_channel_description boolean not null default false,
  add column if not exists show_progress_bar boolean not null default true,
  add column if not exists overlay_position text not null default 'bottom',
  add column if not exists overlay_style text not null default 'gradient',
  add column if not exists accent_color text not null default '#159f90';

alter table public.streaming_channels
  drop constraint if exists streaming_channels_overlay_position_check,
  add constraint streaming_channels_overlay_position_check check (overlay_position in ('top', 'bottom')),
  drop constraint if exists streaming_channels_overlay_style_check,
  add constraint streaming_channels_overlay_style_check check (overlay_style in ('gradient', 'glass', 'minimal')),
  drop constraint if exists streaming_channels_accent_color_check,
  add constraint streaming_channels_accent_color_check check (accent_color ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.streaming_channels.overlay_position is 'Placement of the public player information and controls overlay.';
comment on column public.streaming_channels.overlay_style is 'Visual treatment for the public player information and controls overlay.';
comment on column public.streaming_channels.accent_color is 'Six-digit hex color used for live, progress, and banner accents.';
