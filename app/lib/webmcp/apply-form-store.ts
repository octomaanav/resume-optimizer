export const APPLY_FORM_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "whyThisRole",
  "relevantProject",
] as const;

export type ApplyFormField = (typeof APPLY_FORM_FIELDS)[number];

export type ApplyFormState = {
  values: Record<ApplyFormField, string>;
  lastFilledField: ApplyFormField | null;
  submitted: boolean;
};

export const APPLY_FORM_EVENT = "webmcp:apply-form-changed";

function emptyState(): ApplyFormState {
  return {
    values: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      whyThisRole: "",
      relevantProject: "",
    },
    lastFilledField: null,
    submitted: false,
  };
}

/** Module-level store (not persisted) so both the /apply page and WebMCP tools share one source of truth without going through the real database-backed workspace. */
let state: ApplyFormState = emptyState();

function notify() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APPLY_FORM_EVENT, { detail: state }));
}

export function getApplyFormState(): ApplyFormState {
  return state;
}

export function setApplyFormField(field: ApplyFormField, value: string) {
  state = { ...state, values: { ...state.values, [field]: value }, lastFilledField: field };
  notify();
}

export function resetApplyForm() {
  state = emptyState();
  notify();
}

export function submitApplyForm(): { ok: true } | { ok: false; missing: ApplyFormField[] } {
  const required: ApplyFormField[] = ["firstName", "lastName", "email", "whyThisRole"];
  const missing = required.filter((f) => !state.values[f].trim());
  if (missing.length > 0) return { ok: false, missing };
  state = { ...state, submitted: true };
  notify();
  return { ok: true };
}
