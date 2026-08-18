export type ChannelDisplaySettings = {
  broadcastEnabled: boolean;
  showLiveBadge: boolean;
  showChannelName: boolean;
  showNowPlaying: boolean;
  showAudioControl: boolean;
  showAdvertiserLogo: boolean;
  showStripeBanner: boolean;
  showVideoTime: boolean;
  showFullscreenControl: boolean;
  showLeaveControl: boolean;
  showViewerLogin: boolean;
  showChannelDescription: boolean;
  showProgressBar: boolean;
  stripeBannerText: string;
  stripeBannerPosition: "top" | "bottom";
  videoFit: "contain" | "cover";
  overlayPosition: "top" | "bottom";
  overlayStyle: "gradient" | "glass" | "minimal";
  accentColor: string;
};

const toggles: Array<[keyof ChannelDisplaySettings, string, string]> = [
  ["broadcastEnabled", "Continuous broadcast", "Keep one server-clock timeline running so every viewer joins the live point in the ad loop."],
  ["showLiveBadge", "Live channel badge", "Show the live status label."],
  ["showChannelName", "Channel name", "Show the channel title."],
  ["showNowPlaying", "Now playing", "Show the current ad name."],
  ["showAudioControl", "Audio control", "Allow viewers to enable or mute sound."],
  ["showAdvertiserLogo", "Advertiser logos", "Show each business logo while its ad plays."],
  ["showStripeBanner", "Stripe banner", "Show the configured announcement strip."],
  ["showVideoTime", "Video time", "Show elapsed and total video time."],
  ["showFullscreenControl", "Fullscreen control", "Allow viewers to enter fullscreen mode."],
  ["showLeaveControl", "Leave control", "Allow viewers to end their viewing session from the player."],
  ["showViewerLogin", "Viewer login", "Show the optional viewer identity button."],
  ["showChannelDescription", "Channel description", "Show the channel description in the video overlay."],
  ["showProgressBar", "Progress bar", "Show progress through the ad currently playing."],
];

function inputName(key: keyof ChannelDisplaySettings) {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function ChannelDisplaySettingsFields({ settings }: { settings: ChannelDisplaySettings }) {
  return <fieldset className="channel-display-settings">
    <legend>Video settings</legend>
    <p>Administrator controls for the public player. Changes apply after viewers refresh.</p>
    <div className="channel-display-toggle-grid">{toggles.map(([key, label, description]) => <label key={key}><input type="checkbox" name={inputName(key)} defaultChecked={Boolean(settings[key])} /><span><strong>{label}</strong><small>{description}</small></span></label>)}</div>
    <label><span>Stripe banner text</span><input name="stripe-banner-text" maxLength={240} defaultValue={settings.stripeBannerText} placeholder="Welcome to the Loopline network" /></label>
    <div className="management-field-grid">
      <label><span>Stripe position</span><select name="stripe-banner-position" defaultValue={settings.stripeBannerPosition}><option value="top">Top</option><option value="bottom">Bottom</option></select></label>
      <label><span>Video scaling</span><select name="video-fit" defaultValue={settings.videoFit}><option value="contain">Fit full video</option><option value="cover">Fill screen and crop</option></select></label>
      <label><span>Overlay position</span><select name="overlay-position" defaultValue={settings.overlayPosition}><option value="bottom">Bottom</option><option value="top">Top</option></select></label>
      <label><span>Overlay style</span><select name="overlay-style" defaultValue={settings.overlayStyle}><option value="gradient">Gradient</option><option value="glass">Glass panel</option><option value="minimal">Minimal</option></select></label>
    </div>
    <label><span>Player accent color</span><input name="accent-color" type="color" defaultValue={settings.accentColor} /></label>
  </fieldset>;
}
