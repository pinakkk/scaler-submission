"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import {
  AudioLines,
  CircleHelp,
  Image as ImageIcon,
  MonitorCog,
  Settings2,
  Video,
} from "lucide-react";

import { Button, Checkbox, Modal, Radio, Select, Spinner, Switch, useToast } from "@/components/ui";
import { getPreferences, updatePreferences } from "@/lib/api";
import { getToken, useSession } from "@/lib/session";
import type { ThemeName, UserPreferences } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { requestUserMedia, stopStream } from "@/lib/webrtc/mediaDevices";

export type SettingsTone = "light" | "dark";
type Pane = "general" | "video" | "audio" | "background" | "about";

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  tone?: SettingsTone;
}

const PANES: Array<{
  id: Pane;
  label: string;
  Icon: ComponentType<{ size?: number }>;
  color: string;
  inMeetingOnly?: boolean;
}> = [
  { id: "general", label: "General", Icon: Settings2, color: "bg-zm-icon-general" },
  { id: "video", label: "Video", Icon: Video, color: "bg-zm-icon-video" },
  { id: "audio", label: "Audio", Icon: AudioLines, color: "bg-zm-icon-audio" },
  { id: "background", label: "Background & effects", Icon: ImageIcon, color: "bg-zm-icon-background", inMeetingOnly: true },
  { id: "about", label: "About", Icon: CircleHelp, color: "bg-zm-icon-about" },
];

const THEMES: Array<{ id: ThemeName; label: string; color: string }> = [
  { id: "classic", label: "Classic", color: "bg-[linear-gradient(90deg,#1a1a1a_50%,#fff_50%)]" },
  { id: "bloom", label: "Bloom", color: "bg-zm-theme-bloom" },
  { id: "agave", label: "Agave", color: "bg-zm-theme-agave" },
  { id: "rose", label: "Rose", color: "bg-zm-theme-rose" },
];

export function SettingsModal({ open, onClose, tone = "light" }: SettingsModalProps) {
  const dark = tone === "dark";
  const { signIn } = useSession();
  const { toast } = useToast();
  const token = getToken();
  const [activePane, setActivePane] = useState<Pane>("general");
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(
    token ? null : "Sign in to load and save your preferences.",
  );
  const [saving, setSaving] = useState(false);
  const [decorative, setDecorative] = useState({
    profileIcons: true,
    animateEmojis: true,
    hideNonVideo: false,
    hideSelf: false,
    blurBackground: false,
  });
  const [micLevel, setMicLevel] = useState(0);
  const [micTesting, setMicTesting] = useState(false);
  const [speakerTesting, setSpeakerTesting] = useState(false);

  const previewRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const meterFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!token) return;
    let current = true;

    async function load() {
      try {
        const loaded = await getPreferences({ token: token as string });
        if (!current) return;
        setPreferences(loaded);
        document.documentElement.dataset.zoomTheme = loaded.theme;
        try {
          window.localStorage.setItem("zm.preferences.theme", loaded.theme);
        } catch {
          // Preferences still persist server-side when browser storage is blocked.
        }

        if (navigator.mediaDevices?.enumerateDevices) {
          const available = await navigator.mediaDevices.enumerateDevices();
          if (current) setDevices(available);
        }
      } catch (caught) {
        if (current) {
          setError(caught instanceof Error ? caught.message : "Could not load settings.");
        }
      }
    }

    void load();
    return () => {
      current = false;
    };
  }, [token]);

  const stopPreview = useCallback(() => {
    stopStream(previewStreamRef.current);
    previewStreamRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
  }, []);

  const stopMicTest = useCallback(() => {
    if (meterFrameRef.current !== null) cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = null;
    stopStream(micStreamRef.current);
    micStreamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setMicLevel(0);
    setMicTesting(false);
  }, []);

  useEffect(() => () => {
    stopPreview();
    stopMicTest();
  }, [stopMicTest, stopPreview]);

  function patch<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setPreferences((current) => current ? { ...current, [key]: value } : current);
  }

  async function save() {
    if (!token || !preferences) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await updatePreferences(
        {
          theme: preferences.theme,
          mute_on_join: preferences.mute_on_join,
          video_off_on_join: preferences.video_off_on_join,
          gallery_size: preferences.gallery_size,
          mirror_video: preferences.mirror_video,
          always_show_controls: preferences.always_show_controls,
          audio_input_id: preferences.audio_input_id,
          audio_output_id: preferences.audio_output_id,
          video_input_id: preferences.video_input_id,
        },
        { token },
      );
      setPreferences(saved);
      document.documentElement.dataset.zoomTheme = saved.theme;
      try {
        window.localStorage.setItem("zm.preferences.theme", saved.theme);
        window.localStorage.setItem(
          "zm.preferences.decorative",
          JSON.stringify(decorative),
        );
      } catch {
        // The API save succeeded; local cosmetic storage is best-effort.
      }
      toast("Settings saved.", { tone: dark ? "dark" : "light" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function startPreview() {
    if (!preferences) return;
    stopPreview();
    try {
      const stream = await requestUserMedia({
        audio: false,
        video: preferences.video_input_id
          ? { deviceId: { exact: preferences.video_input_id } }
          : true,
      });
      previewStreamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        await previewRef.current.play();
      }
      const available = await navigator.mediaDevices.enumerateDevices();
      setDevices(available);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Camera preview failed.");
    }
  }

  async function startMicTest() {
    if (!preferences) return;
    stopMicTest();
    try {
      const stream = await requestUserMedia({
        video: false,
        audio: preferences.audio_input_id
          ? { deviceId: { exact: preferences.audio_input_id } }
          : true,
      });
      micStreamRef.current = stream;
      setMicTesting(true);
      const AudioContextClass = window.AudioContext;
      const context = new AudioContextClass();
      audioContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const values = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(values);
        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        setMicLevel(Math.min(100, Math.round((average / 128) * 100)));
        meterFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
      setDevices(await navigator.mediaDevices.enumerateDevices());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Microphone test failed.");
    }
  }

  async function testSpeaker() {
    setSpeakerTesting(true);
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.value = 0.08;
      oscillator.connect(gain).connect(context.destination);
      oscillator.frequency.value = 440;
      oscillator.start();
      oscillator.stop(context.currentTime + 0.35);
      await new Promise((resolve) => setTimeout(resolve, 420));
      await context.close();
    } finally {
      setSpeakerTesting(false);
    }
  }

  const visiblePanes = PANES.filter((pane) => !pane.inMeetingOnly || dark);
  const audioInputs = devices.filter((device) => device.kind === "audioinput");
  const audioOutputs = devices.filter((device) => device.kind === "audiooutput");
  const videoInputs = devices.filter((device) => device.kind === "videoinput");
  const text = dark ? "text-zm-room-text" : "text-zm-ink-900";
  const muted = dark ? "text-white/60" : "text-zm-ink-500";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      tone={tone}
      titleAlign={dark ? "center" : "left"}
      panelClassName="h-[min(var(--zm-settings-h),92vh)] max-w-[var(--zm-settings-w)]"
    >
      <div className="flex h-full min-h-0 flex-col md:flex-row">
        <nav className={cn(
          "flex shrink-0 gap-1 overflow-x-auto p-3 md:w-[var(--zm-settings-nav-w)] md:flex-col md:overflow-y-auto md:border-r md:p-4",
          dark ? "border-zm-modal-dark-border bg-zm-modal-dark-nav" : "border-zm-line-200 bg-zm-modal-light-nav",
        )} aria-label="Settings sections">
          {visiblePanes.map(({ id, label, Icon, color }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActivePane(id)}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-[var(--r-xl)] px-3 py-2.5 text-left text-[14px] font-medium transition-colors md:w-full",
                activePane === id
                  ? dark ? "outline-2 outline-zm-blue-500" : "bg-zm-blue-600 text-white"
                  : dark ? "text-zm-room-text hover:bg-white/5" : "text-zm-ink-700 hover:bg-zm-blue-50",
              )}
            >
              <span className={cn("grid size-8 place-items-center rounded-[10px] text-white", color)}><Icon size={17} /></span>
              <span className="whitespace-nowrap">{label}</span>
            </button>
          ))}
        </nav>

        <section className="min-h-0 flex-1 overflow-y-auto p-5 md:p-8">
          {error ? (
            <div role="alert" className={cn("mb-5 rounded-lg border px-4 py-3 text-[13px]", dark ? "border-red-400/40 bg-red-400/10 text-red-200" : "border-red-200 bg-red-50 text-red-700")}>
              {error}
              {!token ? <button type="button" onClick={() => void signIn()} className="ml-2 font-semibold underline">Sign in</button> : null}
            </div>
          ) : null}

          {!preferences && token && !error ? (
            <div className="grid h-full place-items-center"><Spinner size={30} /></div>
          ) : null}

          {preferences && activePane === "general" ? (
            <div className={cn("space-y-8", text)}>
              <SettingsHeading title="General" description="Choose how Zoom Workplace looks and behaves." muted={muted} />
              <SettingGroup title="Theme">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {THEMES.map((theme) => (
                    <button key={theme.id} type="button" onClick={() => patch("theme", theme.id)} className={cn("rounded-xl border p-2 text-left", preferences.theme === theme.id ? "border-zm-blue-500 ring-2 ring-zm-blue-500/20" : dark ? "border-zm-modal-dark-border" : "border-zm-line-200")}>
                      <span className={cn("block h-14 rounded-lg border border-black/10", theme.color)} />
                      <span className="mt-2 block text-[13px] font-medium">{theme.label}</span>
                    </button>
                  ))}
                </div>
              </SettingGroup>
              <SettingRow label="Always show meeting controls" hint="Keep the room controls visible while you are in a meeting." muted={muted}><Switch checked={preferences.always_show_controls} onCheckedChange={(value) => patch("always_show_controls", value)} aria-label="Always show meeting controls" /></SettingRow>
              <SettingGroup title="Maximum participants per screen">
                <div className="flex gap-6"><Radio tone={tone} name="gallery" label="9 participants" checked={preferences.gallery_size === 9} onChange={() => patch("gallery_size", 9)} /><Radio tone={tone} name="gallery" label="25 participants" checked={preferences.gallery_size === 25} onChange={() => patch("gallery_size", 25)} /></div>
              </SettingGroup>
              <Checkbox tone={tone} label="Show profile icons next to in-meeting chat messages" checked={decorative.profileIcons} onChange={(event) => setDecorative((value) => ({ ...value, profileIcons: event.target.checked }))} />
              <Checkbox tone={tone} label="Animate emojis and reactions" checked={decorative.animateEmojis} onChange={(event) => setDecorative((value) => ({ ...value, animateEmojis: event.target.checked }))} />
            </div>
          ) : null}

          {preferences && activePane === "video" ? (
            <div className={cn("space-y-7", text)}>
              <SettingsHeading title="Video" description="Preview your camera and choose meeting defaults." muted={muted} />
              <div className="aspect-video max-w-xl overflow-hidden rounded-xl bg-black">
                <video ref={previewRef} muted playsInline className={cn("h-full w-full object-cover", preferences.mirror_video && "-scale-x-100")} />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row"><Select value={preferences.video_input_id ?? ""} onChange={(event) => patch("video_input_id", event.target.value || null)} className={dark ? "border-zm-modal-dark-border bg-zm-menu-bg text-white" : undefined}><option value="">System default camera</option>{videoInputs.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</Select><Button variant="secondary" onClick={() => void startPreview()}>Start preview</Button></div>
              <SettingRow label="Mirror my video" hint="Only changes your local preview." muted={muted}><Switch checked={preferences.mirror_video} onCheckedChange={(value) => patch("mirror_video", value)} aria-label="Mirror my video" /></SettingRow>
              <SettingRow label="Turn off my video when joining" hint="Applied before your next meeting connects." muted={muted}><Switch checked={preferences.video_off_on_join} onCheckedChange={(value) => patch("video_off_on_join", value)} aria-label="Turn off my video when joining" /></SettingRow>
              <Checkbox tone={tone} label="Hide non-video participants" checked={decorative.hideNonVideo} onChange={(event) => setDecorative((value) => ({ ...value, hideNonVideo: event.target.checked }))} />
              <Checkbox tone={tone} label="Hide self view" checked={decorative.hideSelf} onChange={(event) => setDecorative((value) => ({ ...value, hideSelf: event.target.checked }))} />
              <SettingGroup title="Video rendering method"><Select defaultValue="auto" className={dark ? "border-zm-modal-dark-border bg-zm-menu-bg text-white" : undefined}><option value="auto">Auto</option><option value="webgl">WebGL</option><option value="canvas">Canvas</option></Select></SettingGroup>
            </div>
          ) : null}

          {preferences && activePane === "audio" ? (
            <div className={cn("space-y-8", text)}>
              <SettingsHeading title="Audio" description="Choose devices and test levels before joining." muted={muted} />
              <SettingGroup title="Speaker">
                <div className="flex flex-col gap-3 sm:flex-row"><Select value={preferences.audio_output_id ?? ""} onChange={(event) => patch("audio_output_id", event.target.value || null)} className={dark ? "border-zm-modal-dark-border bg-zm-menu-bg text-white" : undefined}><option value="">System default speaker</option>{audioOutputs.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Speaker ${index + 1}`}</option>)}</Select><Button variant="secondary" onClick={() => void testSpeaker()} disabled={speakerTesting}>{speakerTesting ? "Playing…" : "Test Speaker"}</Button></div>
                <LevelMeter value={speakerTesting ? 70 : 0} />
              </SettingGroup>
              <SettingGroup title="Microphone">
                <div className="flex flex-col gap-3 sm:flex-row"><Select value={preferences.audio_input_id ?? ""} onChange={(event) => patch("audio_input_id", event.target.value || null)} className={dark ? "border-zm-modal-dark-border bg-zm-menu-bg text-white" : undefined}><option value="">System default microphone</option>{audioInputs.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</Select><Button variant="secondary" onClick={() => micTesting ? stopMicTest() : void startMicTest()}>{micTesting ? "Stop Test" : "Test Mic"}</Button></div>
                <LevelMeter value={micLevel} />
              </SettingGroup>
              <SettingGroup title="Background noise suppression"><div className="flex flex-wrap gap-5"><Radio tone={tone} name="noise" label="Auto" defaultChecked /><Radio tone={tone} name="noise" label="Low" /><Radio tone={tone} name="noise" label="High" /></div></SettingGroup>
              <SettingRow label="Mute my microphone when joining" hint="Applied to the local audio track before your next meeting connects." muted={muted}><Switch checked={preferences.mute_on_join} onCheckedChange={(value) => patch("mute_on_join", value)} aria-label="Mute my microphone when joining" /></SettingRow>
            </div>
          ) : null}

          {preferences && activePane === "background" ? (
            <div className={cn("space-y-7", text)}><SettingsHeading title="Background & effects" description="Choose a local preview effect for this device." muted={muted} /><div className="grid grid-cols-2 gap-4 sm:grid-cols-3"><BackgroundChoice label="None" selected={!decorative.blurBackground} onClick={() => setDecorative((value) => ({ ...value, blurBackground: false }))} className="bg-zm-room-tile" /><BackgroundChoice label="Blur" selected={decorative.blurBackground} onClick={() => setDecorative((value) => ({ ...value, blurBackground: true }))} className="bg-gradient-to-br from-blue-400 via-indigo-400 to-violet-500 blur-[1px]" /><BackgroundChoice label="Studio" selected={false} onClick={() => {}} className="bg-gradient-to-br from-amber-200 to-rose-300" /></div><p className={cn("text-[13px]", muted)}>Background effects are local presentation preferences; they do not alter the transmitted stream in this submission.</p></div>
          ) : null}

          {activePane === "about" ? (
            <div className={cn("space-y-6", text)}><SettingsHeading title="About" description="Zoom Workplace Clone" muted={muted} /><div className={cn("rounded-xl border p-5", dark ? "border-zm-modal-dark-border" : "border-zm-line-200")}><div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-2xl bg-zm-blue-600 text-white"><MonitorCog size={24} /></span><div><p className="font-semibold">Zoom Workplace Clone</p><p className={cn("text-[13px]", muted)}>Version 0.1.0 · Scaler full-stack assignment</p></div></div><p className={cn("mt-5 text-[13px] leading-6", muted)}>Next.js, FastAPI, SQLite, WebSockets, and WebRTC mesh with a six-participant room cap.</p></div></div>
          ) : null}
        </section>
      </div>

      <div className={cn("flex shrink-0 items-center justify-end gap-3 border-t px-6 py-3", dark ? "border-zm-modal-dark-border" : "border-zm-line-200")}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => void save()} disabled={!preferences || saving}>{saving ? "Saving…" : "Save"}</Button>
      </div>
    </Modal>
  );
}

function SettingsHeading({ title, description, muted }: { title: string; description: string; muted: string }) {
  return <header><h3 className="text-[22px] font-semibold">{title}</h3><p className={cn("mt-1 text-[14px]", muted)}>{description}</p></header>;
}

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset><legend className="mb-3 text-[15px] font-semibold">{title}</legend>{children}</fieldset>;
}

function SettingRow({ label, hint, muted, children }: { label: string; hint: string; muted: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-6"><div><p className="text-[14px] font-medium">{label}</p><p className={cn("mt-0.5 text-[12px]", muted)}>{hint}</p></div>{children}</div>;
}

function LevelMeter({ value }: { value: number }) {
  return <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10" aria-label={`Input level ${value}%`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><div className="h-full rounded-full bg-zm-success transition-[width]" style={{ width: `${value}%` }} /></div>;
}

function BackgroundChoice({ label, selected, onClick, className }: { label: string; selected: boolean; onClick: () => void; className: string }) {
  return <button type="button" onClick={onClick} className={cn("rounded-xl border p-2 text-left", selected ? "border-zm-blue-500 ring-2 ring-zm-blue-500/20" : "border-zm-line-200")}><span className={cn("block aspect-video rounded-lg", className)} /><span className="mt-2 block text-[13px] font-medium">{label}</span></button>;
}
