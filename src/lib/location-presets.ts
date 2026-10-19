export type LocationPreset = {
  label: string;
  value: string; // "" means worldwide
  group?: string;
};

export const RWANDA_DISTRICTS: string[] = [
  "Gasabo",
  "Kicukiro",
  "Nyarugenge",
  "Bugesera",
  "Gatsibo",
  "Kayonza",
  "Kirehe",
  "Ngoma",
  "Nyagatare",
  "Rwamagana",
  "Burera",
  "Gakenke",
  "Gicumbi",
  "Musanze",
  "Rulindo",
  "Gisagara",
  "Huye",
  "Kamonyi",
  "Muhanga",
  "Nyamagabe",
  "Nyanza",
  "Nyaruguru",
  "Ruhango",
  "Karongi",
  "Ngororero",
  "Nyabihu",
  "Nyamasheke",
  "Rubavu",
  "Rusizi",
  "Rutsiro",
];

export const LOCATION_PRESETS: LocationPreset[] = [
  { label: "Worldwide", value: "", group: "Global" },
  { label: "Africa", value: "Africa", group: "Global" },
  { label: "Rwanda", value: "Rwanda", group: "Rwanda" },
  { label: "Kigali City", value: "Kigali", group: "Rwanda" },
  ...RWANDA_DISTRICTS.map((d) => ({
    label: d,
    value: `${d}, Rwanda`,
    group: "Rwanda Districts",
  })),
];
