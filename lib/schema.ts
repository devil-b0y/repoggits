import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);
const optionalUrl = z.union([z.literal(''), z.url().max(2000).refine(value => /^https?:\/\//i.test(value), 'Use an HTTP or HTTPS URL.')]).default('');
const date = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => !Number.isNaN(Date.parse(value)), 'Invalid date')]).default('');
export const emailSchema = z.email().max(254).transform(value => value.toLowerCase().trim());
export const passwordSchema = z.string().min(15, 'Use at least 15 characters.').max(128);
export const roles = ['student', 'teacher', 'superadmin'] as const;
export const profileSchema = z.object({
  name: text(100).min(2), rollNumber: text(60).default(''), department: text(100).default(''),
  batch: text(30).default(''), bio: text(1500).default(''), github: optionalUrl, linkedin: optionalUrl,
  avatarId: z.string().uuid().or(z.literal('')).default(''),
});
export const teamMemberSchema = z.object({ name: text(100).min(1), email: emailSchema, contribution: text(200).min(1), branch: text(100).default(''), semester: z.union([z.literal(''),z.enum(['1','2','3','4','5','6','7','8'])]).default(''), college: z.enum(['','GGITS','GGCT']).default(''), photoId: z.string().uuid().or(z.literal('')).default('') });
export const projectSchema = z.object({
  title: text(120).min(3), subject: text(100).default(''), department: text(100).min(2),
  summary: text(300).default(''), description: text(20000).default(''),
  type: z.enum(['Software', 'Hardware', 'Hybrid']), features: z.array(text(300).min(1)).max(30).default([]),
  teamName: text(100).min(2), team: z.array(teamMemberSchema).max(20).default([]),
  tags: z.array(text(40).min(1)).max(40).default([]),
  stack: z.object({ frontend: text(300).default(''), backend: text(300).default(''), database: text(300).default(''), languages: text(300).default(''), frameworks: text(300).default(''), tools: text(300).default('') }).default({ frontend:'', backend:'', database:'', languages:'', frameworks:'', tools:'' }),
  github: optionalUrl, liveUrl: optionalUrl, videoUrl: optionalUrl,
  services: z.array(z.object({name:text(100).min(1),purpose:text(300).default(''),url:optionalUrl})).max(30).default([]),
  startDate: date, endDate: date, purchaseDate: date, year: z.string().regex(/^20\d{2}$/).default(String(new Date().getFullYear())),
  hardwareCosts: z.array(z.object({ name: text(100).min(1), quantity: z.number().int().min(1).max(10000), unitCost: z.number().min(0).max(10000000) })).max(100).default([]),
  softwareCosts: z.array(z.object({ name: text(100).min(1), amount: z.number().min(0).max(10000000) })).max(100).default([]),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).default('INR'), openSource: z.boolean().default(true),
  coverId: z.string().uuid().or(z.literal('')).default(''), galleryIds: z.array(z.string().uuid()).max(8).default([]), sourceId: z.string().uuid().or(z.literal('')).default(''),
}).superRefine((data, ctx) => {
  if (data.startDate && data.endDate && data.endDate < data.startDate) ctx.addIssue({ code:'custom', path:['endDate'], message:'End date must follow the start date.' });
  if (data.type === 'Software' && data.hardwareCosts.length) ctx.addIssue({ code:'custom', path:['hardwareCosts'], message:'Software projects cannot include hardware costs.' });
  if (data.type === 'Hardware' && data.softwareCosts.length) ctx.addIssue({ code:'custom', path:['softwareCosts'], message:'Hardware projects cannot include software costs.' });
});

export type TeamMember = z.infer<typeof teamMemberSchema>;
export type ProjectData = z.infer<typeof projectSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Role = typeof roles[number];
export type VersionStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'changes_requested';
export type User = { id:string; email:string; name:string; role:Role; verified:boolean; suspended:boolean; scopes:string[]; profile:Profile };
export type Version = { id:string; projectId:string; number:number; status:VersionStatus; data:ProjectData; changelog:string; createdAt:string; requiredApprovals:number; approvals:number; feedback?:string };
export type Project = { id:string; ownerId:string; featured:boolean; archived:boolean; views:number; downloads:number; stars:number; likes:number; parentProjectId:string|null; parentVersionId:string|null; example:boolean; version:Version };
export const emptyProject: ProjectData = projectSchema.parse({ title:'Untitled project', department:'Computer Science', type:'Software', teamName:'My team' });

export function projectCost(data: ProjectData) {
  return data.hardwareCosts.reduce((sum, row) => sum + Math.round(row.unitCost * 100) * row.quantity, 0) / 100
    + data.softwareCosts.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
}
