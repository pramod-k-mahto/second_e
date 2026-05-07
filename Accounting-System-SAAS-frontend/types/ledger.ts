export type Ledger = {
  id: number;
  name: string;
  groupName: string;
  openingBalance: number;
  openingType: "DR" | "CR";
  contactPerson?: string | null;
  phone?: string | null;
};
