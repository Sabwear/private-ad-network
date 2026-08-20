"use client";

import { X } from "lucide-react";
import { forwardRef, useEffect, useRef } from "react";

type Props = Omit<React.ComponentPropsWithoutRef<"details">, "children"> & {
  summary: React.ReactNode;
  children: React.ReactNode;
  closeLabel?: string;
};

const registeredPopups = new Set<HTMLDetailsElement>();
let listening = false;

function closePopup(details: HTMLDetailsElement, restoreFocus = false) {
  if (!details.open) return;
  details.open = false;
  if (restoreFocus) details.querySelector("summary")?.focus();
}

function closeFromPointer(event: PointerEvent) {
  if (!(event.target instanceof Node)) return;
  registeredPopups.forEach((details) => {
    if (details.open && !details.contains(event.target as Node)) closePopup(details);
  });
}

function closeFromKeyboard(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  registeredPopups.forEach((details) => closePopup(details, true));
}

function startListening() {
  if (listening) return;
  document.addEventListener("pointerdown", closeFromPointer);
  document.addEventListener("keydown", closeFromKeyboard);
  listening = true;
}

function stopListeningWhenIdle() {
  if (!listening || registeredPopups.size) return;
  document.removeEventListener("pointerdown", closeFromPointer);
  document.removeEventListener("keydown", closeFromKeyboard);
  listening = false;
}

function assignRef(ref: React.ForwardedRef<HTMLDetailsElement>, value: HTMLDetailsElement | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

export const DismissibleDetails = forwardRef<HTMLDetailsElement, Props>(function DismissibleDetails(
  { summary, children, closeLabel = "Close popup", onToggle, ...props },
  forwardedRef,
) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    registeredPopups.add(details);
    startListening();
    return () => {
      registeredPopups.delete(details);
      stopListeningWhenIdle();
    };
  }, []);

  return <details
    {...props}
    ref={(value) => { detailsRef.current = value; assignRef(forwardedRef, value); }}
    onToggle={(event) => {
      onToggle?.(event);
      if (event.currentTarget.open) registeredPopups.forEach((details) => { if (details !== event.currentTarget) closePopup(details); });
    }}
  >
    <summary>{summary}</summary>
    {children}
    <button className="dismissible-details-close" type="button" aria-label={closeLabel} onClick={() => { if (detailsRef.current) closePopup(detailsRef.current); }}><X size={14} /><span>Close</span></button>
  </details>;
});
