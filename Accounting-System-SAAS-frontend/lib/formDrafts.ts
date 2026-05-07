/**
 * Utility to save and load temporary form data during navigation.
 * Uses sessionStorage to ensure data is cleared when the tab is closed.
 */

export function saveFormDraft(key: string, data: any) {
  if (typeof window === "undefined") return;
  try {
    const serializedData = JSON.stringify(data);
    window.sessionStorage.setItem(`form_draft_${key}`, serializedData);
  } catch (err) {
    console.error("Failed to save form draft:", err);
  }
}

export function loadFormDraft(key: string): any | null {
  if (typeof window === "undefined") return null;
  try {
    const serializedData = window.sessionStorage.getItem(`form_draft_${key}`);
    if (!serializedData) return null;
    return JSON.parse(serializedData);
  } catch (err) {
    console.error("Failed to load form draft:", err);
    return null;
  }
}

export function clearFormDraft(key: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(`form_draft_${key}`);
}
