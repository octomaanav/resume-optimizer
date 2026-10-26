import type { KeyboardEvent } from "react";

/** Arrow keys select and focus a radio within its owning group. */
export function handleRadioKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const group = event.currentTarget.closest('[role="radiogroup"]');
  const radios = Array.from(group?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)') ?? []);
  if (!radios.length) return;
  event.preventDefault();
  const index = radios.indexOf(event.currentTarget);
  const next = event.key === "Home" ? 0 : event.key === "End" ? radios.length - 1
    : (index + (event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1) + radios.length) % radios.length;
  radios[next].focus();
  radios[next].click();
}
