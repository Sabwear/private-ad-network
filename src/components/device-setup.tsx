"use client";

import { CheckCircle2, Cpu, KeyRound, LoaderCircle, MonitorUp, Network, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  collectDeviceClientInfo,
  createDeviceKeyPair,
  loadDeviceSession,
  storeDeviceSession,
  type DeviceClientInfo,
  type StoredDeviceSession,
} from "@/lib/device/client-info";

type PairingState = "idle" | "preparing" | "pending" | "active" | "expired" | "error";

async function sendHeartbeat(session: StoredDeviceSession, clientInfo: DeviceClientInfo) {
  if (!session.devicePublicId) return false;
  const response = await fetch("/api/v1/devices/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.credentialToken}` },
    body: JSON.stringify({ devicePublicId: session.devicePublicId, clientInfo }),
  });
  return response.ok;
}

export function DeviceSetup() {
  const [clientInfo, setClientInfo] = useState<DeviceClientInfo | null>(null);
  const [session, setSession] = useState<StoredDeviceSession | null>(null);
  const [state, setState] = useState<PairingState>("idle");
  const [message, setMessage] = useState("Generate a secure code, then enter it in the business portal.");
  const [clock, setClock] = useState(0);

  const checkActivation = useCallback(async (currentSession: StoredDeviceSession, info: DeviceClientInfo) => {
    const response = await fetch("/api/v1/devices/activation/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activationId: currentSession.activationId, credentialToken: currentSession.credentialToken }),
    });

    if (!response.ok) {
      setState("expired");
      setMessage("This pairing session is no longer valid. Generate a new code.");
      return;
    }

    const result = await response.json() as { status: string; device_public_id?: string };
    if (result.status === "claimed" && result.device_public_id) {
      const activeSession = { ...currentSession, devicePublicId: result.device_public_id };
      await storeDeviceSession(activeSession);
      setSession(activeSession);
      setState("active");
      setMessage("Screen paired successfully. Secure heartbeat reporting is active.");
      await sendHeartbeat(activeSession, info);
    } else if (result.status === "expired") {
      setState("expired");
      setMessage("The code expired before it was claimed. Generate a new one.");
    }
  }, []);

  useEffect(() => {
    const info = collectDeviceClientInfo();
    void loadDeviceSession().then(async (stored) => {
      setClientInfo(info);
      setClock(Date.now());
      if (!stored) return;
      setSession(stored);
      if (stored.devicePublicId) {
        setState("active");
        setMessage("This screen is paired. Secure heartbeat reporting is active.");
        await sendHeartbeat(stored, info);
      } else if (new Date(stored.expiresAt).getTime() > Date.now()) {
        setState("pending");
        setMessage("Waiting for an authorized user to claim this screen.");
        await checkActivation(stored, info);
      } else {
        setState("expired");
      }
    }).catch(() => {
      setClientInfo(info);
      setState("error");
      setMessage("Secure device storage is unavailable in this browser.");
    });
  }, [checkActivation]);

  useEffect(() => {
    if (state !== "pending") return;
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (!session || !clientInfo || state !== "pending") return;
    const timer = window.setInterval(() => void checkActivation(session, clientInfo), 3_000);
    return () => window.clearInterval(timer);
  }, [checkActivation, clientInfo, session, state]);

  useEffect(() => {
    if (!session?.devicePublicId || !clientInfo || state !== "active") return;
    const heartbeat = () => void sendHeartbeat(session, collectDeviceClientInfo());
    const timer = window.setInterval(heartbeat, 45_000);
    window.addEventListener("online", heartbeat);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", heartbeat);
    };
  }, [clientInfo, session, state]);

  async function createPairing() {
    setState("preparing");
    setMessage("Creating a device key and secure activation session...");
    try {
      const info = collectDeviceClientInfo();
      const identity = await createDeviceKeyPair();
      const response = await fetch("/api/v1/devices/activation/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKeyJwk: identity.publicKeyJwk, keyFingerprint: identity.fingerprint, deviceInfo: info }),
      });
      const result = await response.json() as { activationId?: string; credentialToken?: string; code?: string; expiresAt?: string; error?: string };
      if (!response.ok || !result.activationId || !result.credentialToken || !result.code || !result.expiresAt) {
        throw new Error(result.error || "Unable to create pairing code.");
      }

      const nextSession: StoredDeviceSession = {
        activationId: result.activationId,
        credentialToken: result.credentialToken,
        code: result.code,
        expiresAt: result.expiresAt,
        privateKey: identity.privateKey,
      };
      await storeDeviceSession(nextSession);
      setClientInfo(info);
      setSession(nextSession);
      setClock(Date.now());
      setState("pending");
      setMessage("Enter this code in Screens inside the authorized business portal.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Secure pairing could not be started.");
    }
  }

  const expiresIn = session && !session.devicePublicId
    ? Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - clock) / 60_000))
    : null;

  return (
    <main className="device-setup-page">
      <section className="device-setup-card">
        <header><span className="device-setup-logo"><MonitorUp size={26} /></span><div><strong>Loopline Screen</strong><small>Secure playback device setup</small></div></header>
        <div className="device-setup-status" aria-live="polite">
          {state === "active" ? <CheckCircle2 size={38} /> : state === "preparing" ? <LoaderCircle className="auth-spinner" size={38} /> : <KeyRound size={38} />}
          <p>{state === "active" ? "Screen connected" : "Pair this screen"}</p>
          {session && state === "pending" ? <strong className="pairing-code">{session.code}</strong> : null}
          <small>{message}</small>
          {expiresIn !== null && state === "pending" ? <span>Expires in approximately {expiresIn} minutes</span> : null}
          {state !== "active" ? <button className="button button-primary" type="button" onClick={createPairing} disabled={state === "preparing"}>{state === "expired" || state === "error" ? <RefreshCw size={17} /> : <KeyRound size={17} />}{state === "preparing" ? "Preparing..." : session && state === "pending" ? "Generate a new code" : "Generate pairing code"}</button> : null}
        </div>

        {clientInfo ? <div className="device-diagnostics"><div><Cpu size={17} /><span><small>Detected device</small><strong>{clientInfo.deviceType} / {clientInfo.osName}</strong></span></div><div><MonitorUp size={17} /><span><small>Display</small><strong>{clientInfo.screenWidth} x {clientInfo.screenHeight} at {clientInfo.devicePixelRatio}x</strong></span></div><div><Network size={17} /><span><small>Connection</small><strong>{clientInfo.connectionType}</strong></span></div><div><ShieldCheck size={17} /><span><small>Credential storage</small><strong>Device-only protected key</strong></span></div></div> : null}
        <footer>Operational diagnostics only / No camera, microphone, or audience identification</footer>
      </section>
    </main>
  );
}
