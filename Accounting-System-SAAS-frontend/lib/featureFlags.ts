export type TenantFlags = {
  FEATURE_MENU_PERMISSIONS?: boolean | { companies?: number[] };
};

function parseEnvFlag(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isMenuPermissionsFeatureEnabled(params: {
  companyId?: number | null;
  currentUser?: any;
}): boolean {
  return true;
}
