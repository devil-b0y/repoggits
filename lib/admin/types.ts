// One definition of every event type, filter option, label and response shape, shared by the tracker (lib/tracking),
// the admin API (lib/admin) and the admin pages (components/platform/admin). Safe to import from client components.

export const EVENT_CATEGORIES={navigation:'Navigation',auth:'Sign-in',account:'Account',project:'Projects',community:'Community',file:'Files',ai:'AI and prompts',security:'Security',admin:'Admin actions'} as const;
export type EventCategory=keyof typeof EVENT_CATEGORIES;

export const EVENT_TYPES={
  PAGE_VIEW:{label:'Page view',category:'navigation'},
  SEARCH:{label:'Search',category:'navigation'},
  SIGNUP:{label:'Sign-up',category:'auth'},
  LOGIN:{label:'Login',category:'auth'},
  LOGOUT:{label:'Logout',category:'auth'},
  EMAIL_VERIFIED:{label:'Email verified',category:'auth'},
  PROFILE_UPDATE:{label:'Profile update',category:'account'},
  PROJECT_VIEW:{label:'Project view',category:'project'},
  PROJECT_CREATE:{label:'Project create',category:'project'},
  PROJECT_UPDATE:{label:'Project update',category:'project'},
  PROJECT_DELETE:{label:'Project delete',category:'project'},
  PROJECT_SHARE:{label:'Project share',category:'project'},
  PROJECT_DOWNLOAD:{label:'Project download',category:'project'},
  PROJECT_LIKE:{label:'Like',category:'community'},
  PROJECT_BOOKMARK:{label:'Bookmark',category:'community'},
  COMMENT_CREATE:{label:'Comment',category:'community'},
  COMMENT_DELETE:{label:'Comment deleted',category:'community'},
  FILE_UPLOAD:{label:'File upload',category:'file'},
  FILE_DOWNLOAD:{label:'File download',category:'file'},
  AI_FEATURE_USED:{label:'AI feature used',category:'ai'},
  PROMPT_SUBMITTED:{label:'Prompt submitted',category:'ai'},
  PROMPT_COMPLETED:{label:'Prompt completed',category:'ai'},
  PROMPT_FAILED:{label:'Prompt failed',category:'ai'},
  PROMPT_TIMEOUT:{label:'Prompt timed out',category:'ai'},
  PROMPT_REFUSED:{label:'Prompt refused',category:'ai'},
  PROMPT_RATE_LIMITED:{label:'Prompt rate limited',category:'ai'},
  PROMPT_CANCELLED:{label:'Prompt cancelled',category:'ai'},
  LOGIN_FAILED:{label:'Failed login',category:'security'},
  PASSWORD_RESET:{label:'Password reset',category:'security'},
  RATE_LIMITED:{label:'Rate limited',category:'security'},
  ACCESS_DENIED:{label:'Access denied',category:'security'},
  SESSION_REVOKED:{label:'Session ended by an admin',category:'security'},
  ADMIN_ACTION:{label:'Admin action',category:'admin'},
} as const satisfies Record<string,{label:string;category:EventCategory}>;
export type EventType=keyof typeof EVENT_TYPES;
export const eventLabel=(type:string)=>(EVENT_TYPES as Record<string,{label:string}>)[type]?.label??type.replaceAll('_',' ').toLowerCase();

type FilterGroup={label:string;types?:readonly EventType[];category?:EventCategory};
// The Activity filter on log pages (?event=). Each option matches listed types or a whole category.
export const ACTIVITY_FILTERS={
  login:{label:'Login',types:['LOGIN']},
  logout:{label:'Logout',types:['LOGOUT']},
  page_view:{label:'Page view',types:['PAGE_VIEW']},
  project_view:{label:'Project view',types:['PROJECT_VIEW']},
  project_create:{label:'Project create',types:['PROJECT_CREATE']},
  project_update:{label:'Project update',types:['PROJECT_UPDATE']},
  project_delete:{label:'Project delete',types:['PROJECT_DELETE']},
  project_share:{label:'Project share',types:['PROJECT_SHARE']},
  project_download:{label:'Project download',types:['PROJECT_DOWNLOAD']},
  search:{label:'Search',types:['SEARCH']},
  file_upload:{label:'File upload',types:['FILE_UPLOAD']},
  file_download:{label:'File download',types:['FILE_DOWNLOAD']},
  comment:{label:'Comment',types:['COMMENT_CREATE','COMMENT_DELETE']},
  like:{label:'Like',types:['PROJECT_LIKE']},
  bookmark:{label:'Bookmark',types:['PROJECT_BOOKMARK']},
  prompt:{label:'AI / prompt usage',category:'ai'},
  security:{label:'Security events',category:'security'},
  admin:{label:'Admin actions',category:'admin'},
} as const satisfies Record<string,FilterGroup>;
export type ActivityFilter=keyof typeof ACTIVITY_FILTERS;
// The Prompt activity filter (?prompt=).
export const PROMPT_ACTIVITY_FILTERS={
  all:{label:'All prompts',types:['AI_FEATURE_USED','PROMPT_SUBMITTED','PROMPT_COMPLETED','PROMPT_FAILED','PROMPT_TIMEOUT','PROMPT_REFUSED','PROMPT_RATE_LIMITED','PROMPT_CANCELLED']},
  submitted:{label:'Prompt submitted',types:['PROMPT_SUBMITTED']},
  completed:{label:'Prompt completed',types:['PROMPT_COMPLETED']},
  failed:{label:'Prompt failed',types:['PROMPT_FAILED','PROMPT_TIMEOUT','PROMPT_REFUSED']},
  cancelled:{label:'Prompt cancelled',types:['PROMPT_CANCELLED']},
  rate_limited:{label:'Prompt rate limited',types:['PROMPT_RATE_LIMITED']},
} as const satisfies Record<string,FilterGroup>;
export type PromptActivityFilter=keyof typeof PROMPT_ACTIVITY_FILTERS;

// r.ai_requests.outcome, the status administrators filter prompt logs by (?status=).
export const PROMPT_OUTCOMES={success:'Success',failed:'Failed',cancelled:'Cancelled',rate_limited:'Rate limited',timeout:'Timeout',refused:'Refused',pending:'In progress'} as const;
export type PromptOutcome=keyof typeof PROMPT_OUTCOMES;
export const AI_FEATURES={project_draft:'Project draft assistant'} as const;

export const DEVICE_TYPES={desktop:'Desktop',mobile:'Mobile',tablet:'Tablet',bot:'Bot',unknown:'Unknown'} as const;
export type DeviceType=keyof typeof DEVICE_TYPES;
// Canonical names stored in os / browser columns. Filters offer these; "Other" matches anything else.
export const OS_FAMILIES=['Windows','macOS','Linux','Android','iOS','ChromeOS','Other'] as const;
export const BROWSER_FAMILIES=['Chrome','Safari','Firefox','Edge','Opera','Samsung Internet','Other'] as const;

export const DATE_PRESETS={today:'Today',yesterday:'Yesterday','7d':'Last 7 days','30d':'Last 30 days','90d':'Last 90 days',custom:'Custom range'} as const;
export type DatePreset=keyof typeof DATE_PRESETS;
export const SESSION_STATUSES={online:'Online',offline:'Offline',ended:'Ended'} as const;
export type SessionStatus=keyof typeof SESSION_STATUSES;
export const VISITOR_KINDS={authenticated:'Authenticated user',anonymous:'Anonymous visitor'} as const;
export type VisitorKind=keyof typeof VISITOR_KINDS;

// The browser tracker sends a heartbeat this often while its tab is visible. The server's online window
// (PRESENCE_TIMEOUT_SECONDS, default 120) spans at least two heartbeats.
export const HEARTBEAT_SECONDS=45;

// ----- Response shapes -----
// ipAddress is null whenever the viewer lacks the `network` permission; it is never sent to them.
export type Paged<T>={items:T[];page:number;pageSize:number;total:number;totalCapped:boolean;nextCursor:string|null};
export type PersonRef={id:string;name:string;role:string};
export type ProjectRef={id:string;title:string};
export type ActivityRow={id:string;eventType:string;label:string;category:EventCategory;status:'success'|'failure';createdAt:string;user:PersonRef|null;visitorId:string|null;sessionId:string|null;project:ProjectRef|null;promptId:string|null;page:string;ipAddress:string|null;deviceType:DeviceType;os:string;browser:string;userAgent:string;metadata:Record<string,unknown>};
export type PromptRow={id:string;createdAt:string;user:PersonRef;feature:string;project:ProjectRef|null;outcome:PromptOutcome;reason:string;durationMs:number|null;model:string;promptChars:number;promptTokens:number|null;responseTokens:number|null;totalTokens:number|null;sessionId:string|null;deviceType:DeviceType;os:string;browser:string;ipAddress:string|null};
export type SessionRow={id:string;kind:VisitorKind;user:PersonRef|null;visitorId:string|null;status:SessionStatus;startedAt:string;lastSeenAt:string;endedAt:string|null;endReason:string;durationMs:number;ipAddress:string|null;deviceType:DeviceType;os:string;osVersion:string;browser:string;browserVersion:string;userAgent:string;platform:string;screenWidth:number|null;screenHeight:number|null;pixelRatio:number|null;touch:boolean|null;language:string;timezone:string;networkOnline:boolean|null;referrer:string;currentPath:string;currentProject:ProjectRef|null};
export type LiveSnapshot={generatedAt:string;onlineWindowSeconds:number;counts:{online:number;authenticated:number;anonymous:number;activeSessions:number};sessions:SessionRow[]};
export type AuditRow={id:string;createdAt:string;actor:PersonRef|null;action:string;targetId:string;details:Record<string,unknown>};
export type StatCard={key:string;label:string;value:number;format:'number'|'bytes'|'duration'|'percent';current:number|null;previous:number|null;change:number|null;trend:number[];href:string;hint?:string};
