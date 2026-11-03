// The browser's Contact Picker (Android Chrome): the user chooses contacts from their phone, and the site only
// gets the ones chosen, never the whole address book. iPhone Safari and desktop browsers don't support it.

export interface PickedContact {
  name: string;
  phone: string;
}

interface ContactsManager {
  select(props: ("name" | "tel")[], opts?: { multiple?: boolean }): Promise<{ name?: string[]; tel?: string[] }[]>;
}

const manager = () =>
  typeof navigator !== "undefined" ? ((navigator as Navigator & { contacts?: ContactsManager }).contacts ?? null) : null;

export const canPickContacts = () => !!manager()?.select;

/** Opens the phone's contact list; resolves to [] if the user cancels. */
export async function pickContacts(multiple: boolean): Promise<PickedContact[]> {
  const m = manager();
  if (!m) return [];
  try {
    const picked = await m.select(["name", "tel"], { multiple });
    return picked
      .map((c) => ({ name: (c.name?.[0] ?? "").trim(), phone: (c.tel?.[0] ?? "").trim() }))
      .filter((c) => c.phone || c.name);
  } catch {
    return [];
  }
}
