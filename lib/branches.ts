// The branch catalog, kept in one place so the admin "Add from catalog" picker and the per-team-member Branch
// dropdown can never drift apart. Names only — the icon for each is chosen by departmentIconFor in
// components/platform/Submit.tsx, whose rules match on the keywords and abbreviations used here.
//
// Sourced directly from the two colleges this app's own College field already offers (GGITS, GGCT) — not a
// generic RGPV-wide list, since RGPV itself has hundreds of affiliated colleges with different branch mixes and
// this app's students are only ever at one of these two:
//  - GGITS: https://www.ggits.org/academics/programmes (fetched 2026-09-19)
//  - GGCT:  https://www.ggct.co.in/ (fetched 2026-09-19)
// A branch offered at only one college still appears once here — the Branch field is independent of the College
// field, so any name here stays pickable regardless of which college is chosen alongside it. Branches identical in
// substance but named slightly differently across the two colleges' own sites (e.g. GGITS's "CSE - Artificial
// Intelligence and Machine Learning" vs GGCT's "AIML") are merged into one entry rather than listed twice.
//
// A student's branch ("B.Tech CSE (IoT, Cyber Security & Blockchain)") is not the same thing as the project's
// department: the department list is admin-configured in Admin > Settings, while this catalog ships with the app.
export const branchCatalog:{group:string;items:string[]}[]=[
 {group:'B.Tech',items:[
   'B.Tech CSE','B.Tech CSD (Computer Science & Design)','B.Tech CSBS','B.Tech CSE (AI & ML)',
   'B.Tech CSE (AI & Data Science)','B.Tech AI & Robotics','B.Tech CSE (IoT, Cyber Security & Blockchain)',
   'B.Tech ECE','B.Tech EEE (Electrical & Electronics)','B.Tech EE','B.Tech CE','B.Tech ME',
 ]},
 {group:'M.Tech',items:[
   'M.Tech CSE','M.Tech IoT & Sensor Systems','M.Tech Structural Engineering','M.Tech Energy Technology',
 ]},
 {group:'Postgraduate & Diploma',items:[
   'MCA','MBA','B.Pharm','D.Pharm',
 ]},
];

export const allBranches=branchCatalog.flatMap(group=>group.items);
