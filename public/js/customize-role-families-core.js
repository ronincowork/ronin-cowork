/* Pure role-family membership operations; DOM composition lives beside this module. */
import { request } from './request.js';

export const familyMembership = (family) =>
  Array.isArray(family?.session_roles)
    ? [...new Set(family.session_roles.filter((name) => typeof name === 'string' && name))]
    : [];

export const toggledMembership = (family, roleName) => {
  const current = familyMembership(family);
  return current.includes(roleName) ? current.filter((name) => name !== roleName) : [...current, roleName];
};

/** The server owns every refusal, especially the pinned default_lead_role rule. */
export async function saveFamilyMembership(family, roleName, send = request) {
  const next = toggledMembership(family, roleName);
  const result = await send(`/api/role-families/${encodeURIComponent(family.name)}/session_roles`, {
    method: 'PUT',
    json: { session_roles: next },
  });
  return { result, next };
}
