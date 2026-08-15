export type ChannelDisplaySettings = {
  broadcastEnabled: boolean;
  showLiveBadge: boolean;
  showChannelName: boolean;
  showNowPlaying: boolean;
  showAudioControl: boolean;
  showAdvertiserLogo: boolean;
  showStripeBanner: boolean;
  showVideoTime: boolean;
  stripeBannerText: string;
  stripeBannerPosition: string;
  videoFit: string;
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
];

function inputName(key: keyof ChannelDisplaySettings) {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function ChannelDisplaySettingsFields({ settings }: { settings: ChannelDisplaySettings }) {
  return <fieldset className="channel-display-settings">
    <legend>Stream display</legend>
    <p>These controls affect the public player immediately after saving.</p>
    <div className="channel-display-toggle-grid">{toggles.map(([key, label, description]) => <label key={key}><input type="checkbox" name={inputName(key)} defaultChecked={Boolean(settings[key])} /><span><strong>{label}</strong><small>{description}</small></span></label>)}</div>
    <label><span>Stripe banner text</span><input name="stripe-banner-text" maxLength={240} defaultValue={settings.stripeBannerText} placeholder="Welcome to the Loopline network" /></label>
    <div className="management-field-grid">
      <label><span>Stripe position</span><select name="stripe-banner-position" defaultValue={settings.stripeBannerPosition}><option value="top">Top</option><option value="bottom">Bottom</option></select></label>
      <label><span>Video scaling</span><select name="video-fit" defaultValue={settings.videoFit}><option value="contain">Fit full video</option><option value="cover">Fill screen and crop</option></select></label>
    </div>
  </fieldset>;
}
