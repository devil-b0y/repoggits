// The typeface a team chooses for their published project page. Only a short key is stored; the stack lives here.
//
// Every stack is built from the three families this site already vendors under public/fonts (with their licences)
// plus faces the reader's own system provides. Nothing here downloads a font at view time: a project page cannot
// be made slower, or made to call a font CDN, by the choice its authors make.
export type ProjectFont={key:string;name:string;note:string;stack:string};

export const projectFonts:ProjectFont[]=[
  {key:'studio',name:'Studio default',note:'Space Grotesk headings, DM Sans text',stack:"'DM Sans',sans-serif"},
  {key:'grotesque',name:'Modern grotesque',note:'Geometric and technical',stack:"'Space Grotesk',sans-serif"},
  {key:'editorial',name:'Editorial serif',note:'Warm, printed, unhurried',stack:"'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif"},
  {key:'classic',name:'Classic serif',note:'Familiar and formal',stack:"Georgia,'Times New Roman',Times,serif"},
  {key:'system',name:'Clean system sans',note:'Native on every device',stack:"system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"},
  {key:'technical',name:'Technical mono',note:'For code-heavy write-ups',stack:"ui-monospace,'Cascadia Code','Source Code Pro',Consolas,monospace"},
  {key:'notebook',name:'Notebook hand',note:'Handwritten, best kept short',stack:"'Caveat',cursive"},
];

export const DEFAULT_FONT=projectFonts[0];
export const findFont=(key:string)=>projectFonts.find(font=>font.key===key)??DEFAULT_FONT;
export const fontStack=(key:string)=>findFont(key).stack;
