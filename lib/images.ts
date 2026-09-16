// Widths that /api/files/:id?w= scales uploaded photos to. A fixed set bounds how many copies of a photo can exist.
export const IMAGE_WIDTHS=[480,960,1600] as const;
export type ImageWidth=typeof IMAGE_WIDTHS[number];
export const imageUrl=(id:string,width?:ImageWidth)=>`/api/files/${id}${width?`?w=${width}`:''}`;
export const imageSrcSet=(id:string)=>IMAGE_WIDTHS.map(width=>`${imageUrl(id,width)} ${width}w`).join(', ');
