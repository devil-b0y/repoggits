import type { DeviceType } from '../admin/types';
import { cleanText } from '../safe-text';

// Device type, operating system and browser from the User-Agent, Client Hints and what the browser tracker reports,
// with no dependencies. Names are the canonical OS_FAMILIES and BROWSER_FAMILIES of lib/admin/types.ts.

export type ClientDevice={platform?:string;touchPoints?:number|null;screenWidth?:number|null;screenHeight?:number|null;uaData?:{mobile?:boolean;platform?:string;brands?:{brand:string;version:string}[]}|null};
export type DeviceHints={userAgent?:string|null;secChUa?:string|null;secChUaMobile?:string|null;secChUaPlatform?:string|null;secChUaPlatformVersion?:string|null};
export type DeviceInfo={deviceType:DeviceType;os:string;osVersion:string;browser:string;browserVersion:string;userAgent:string};

const BOT=/(?<!cu)bot\b|bot\/|crawler|spider|slurp|headless|lighthouse|pagespeed|bingpreview|facebookexternalhit|embedly|curl\/|wget\/|python-|httpclient|okhttp|go-http-client|axios\/|node-fetch|undici|phantomjs|puppeteer|playwright|selenium|scrapy/i;
const WINDOWS_NT:Record<string,string>={'10.0':'10','6.3':'8.1','6.2':'8','6.1':'7','6.0':'Vista','5.1':'XP'};
const HINT_PLATFORMS:Record<string,string>={windows:'Windows',macos:'macOS',linux:'Linux',android:'Android',ios:'iOS','chrome os':'ChromeOS','chromium os':'ChromeOS'};
// Order matters: Edge, Opera and Samsung Internet also carry a Chrome token, and every engine but Firefox carries Safari.
const BROWSERS:[RegExp,string][]=[
  [/\bEdg(?:e|A|iOS)?\/(\d[\d.]*)/,'Edge'],
  [/\b(?:OPR|OPiOS|OPT|OPX)\/(\d[\d.]*)/,'Opera'],
  [/\bOpera\/.*\bVersion\/(\d[\d.]*)/,'Opera'],
  [/\bOpera[ /](\d[\d.]*)/,'Opera'],
  [/\bSamsungBrowser\/(\d[\d.]*)/,'Samsung Internet'],
  [/\b(?:Vivaldi|YaBrowser|UCBrowser|MiuiBrowser)\/(\d[\d.]*)/,'Other'],
  [/\b(?:Firefox|FxiOS)\/(\d[\d.]*)/,'Firefox'],
  [/(?:HeadlessChrome|\bChrome|\bCriOS|\bChromium)\/(\d[\d.]*)/,'Chrome'],
  [/\bVersion\/(\d[\d.]*).*\bSafari\//,'Safari'],
];
const HINT_BROWSERS:[RegExp,string][]=[[/edge/i,'Edge'],[/opera/i,'Opera'],[/samsung/i,'Samsung Internet'],[/google chrome|chromium/i,'Chrome']];

const unquote=(value?:string|null)=>(value||'').trim().replace(/^"|"$/g,'');
const majorMinor=(value?:string)=>(value||'').split('.').slice(0,2).filter(Boolean).join('.');

// Client Hints give the real version where the User-Agent is frozen (Windows NT 10.0, Mac OS X 10_15_7, Android 10; K).
function hintVersion(os:string,hints:DeviceHints) {
  const platform=HINT_PLATFORMS[unquote(hints.secChUaPlatform).toLowerCase()],version=unquote(hints.secChUaPlatformVersion);
  if(platform!==os||!/^\d+(?:\.\d+)*$/.test(version))return '';
  const major=Number(version.split('.')[0]);
  // Windows 11 reports platform version 13 or later, Windows 10 reports 1 to 10, and older releases 0.
  if(os==='Windows')return major>=13?'11':major>0?'10':'';
  return os==='Android'?String(major):majorMinor(version);
}

function operatingSystem(ua:string,hints:DeviceHints,client?:ClientDevice|null):{os:string;osVersion:string} {
  let match:RegExpExecArray|null;
  if((match=/(?:iPhone|iPad|iPod).*?OS (\d+(?:_\d+){0,2})/.exec(ua)))return {os:'iOS',osVersion:majorMinor(match[1].replaceAll('_','.'))};
  if(/iPhone|iPad|iPod/.test(ua))return {os:'iOS',osVersion:''};
  // iPadOS asks for desktop sites with a Mac User-Agent. A Mac has no touch screen, so touch points give it away,
  // and its Safari version is the iPadOS version.
  if(/Macintosh/.test(ua)&&(client?.touchPoints??0)>1)return {os:'iOS',osVersion:majorMinor(/\bVersion\/([\d.]+)/.exec(ua)?.[1])};
  if(/Android/.test(ua))return {os:'Android',osVersion:hintVersion('Android',hints)||majorMinor(/Android[ /]?(\d+(?:\.\d+)?)/.exec(ua)?.[1])};
  if(/CrOS/.test(ua))return {os:'ChromeOS',osVersion:/CrOS \S+ ([\d.]+)/.exec(ua)?.[1]||''};
  if((match=/Windows NT (\d+\.\d+)/.exec(ua)))return {os:'Windows',osVersion:hintVersion('Windows',hints)||WINDOWS_NT[match[1]]||match[1]};
  if(/Windows/.test(ua))return {os:'Windows',osVersion:''};
  if((match=/Mac OS X (\d+(?:[_.]\d+){1,2})/.exec(ua)))return {os:'macOS',osVersion:hintVersion('macOS',hints)||majorMinor(match[1].replaceAll('_','.'))};
  if(/Macintosh/.test(ua))return {os:'macOS',osVersion:''};
  if(/Linux|X11/.test(ua))return {os:'Linux',osVersion:''};
  return {os:HINT_PLATFORMS[(unquote(hints.secChUaPlatform)||client?.uaData?.platform||'').toLowerCase()]||'Other',osVersion:''};
}

function hintedBrowser(hints:DeviceHints,client?:ClientDevice|null) {
  const brands=[...(client?.uaData?.brands||[]),...Array.from((hints.secChUa||'').matchAll(/"([^"]{1,100})";\s*v="([^"]{0,40})"/g),match=>({brand:match[1],version:match[2]}))];
  for(const [pattern,browser] of HINT_BROWSERS){const found=brands.find(item=>pattern.test(item.brand));if(found)return {browser,browserVersion:majorMinor(found.version)};}
  return null;
}

function deviceType(ua:string,os:string,hints:DeviceHints,client?:ClientDevice|null):DeviceType {
  if(BOT.test(ua))return 'bot';
  const touchPoints=client?.touchPoints??0;
  if(/iPad/.test(ua)||/Macintosh/.test(ua)&&touchPoints>1)return 'tablet';
  if(/iPhone|iPod/.test(ua))return 'mobile';
  if(/Kindle|Silk\/|PlayBook|\bTablet\b(?! PC)/i.test(ua))return 'tablet';
  // Android phones say Mobile; Android tablets leave it out.
  if(/Android/.test(ua))return /Mobile/.test(ua)?'mobile':'tablet';
  if(hints.secChUaMobile==='?1'||client?.uaData?.mobile===true||/Mobi|Opera Mini|IEMobile/i.test(ua))return 'mobile';
  if(['Windows','macOS','Linux','ChromeOS'].includes(os))return 'desktop';
  // Nothing identifies the device, so the screen breaks the tie.
  const width=client?.screenWidth??0,height=client?.screenHeight??0;
  if(!width||!height)return 'unknown';
  if(touchPoints>0)return Math.min(width,height)>=600?'tablet':'mobile';
  return 'desktop';
}

export function detectDevice(hints:DeviceHints,client?:ClientDevice|null):DeviceInfo {
  const userAgent=cleanText(hints.userAgent,512);
  const {os,osVersion}=operatingSystem(userAgent,hints,client);
  let browser='Other',browserVersion='';
  for(const [pattern,name] of BROWSERS){const match=pattern.exec(userAgent);if(match){browser=name;browserVersion=majorMinor(match[1]);break;}}
  if(browser==='Other'&&!browserVersion){const hinted=hintedBrowser(hints,client);if(hinted)({browser,browserVersion}=hinted);}
  return {deviceType:deviceType(userAgent,os,hints,client),os,osVersion:cleanText(osVersion,40),browser,browserVersion:cleanText(browserVersion,20),userAgent};
}

export function deviceFromHeaders(headers:Headers,client?:ClientDevice|null):DeviceInfo {
  return detectDevice({userAgent:headers.get('user-agent'),secChUa:headers.get('sec-ch-ua'),secChUaMobile:headers.get('sec-ch-ua-mobile'),secChUaPlatform:headers.get('sec-ch-ua-platform'),secChUaPlatformVersion:headers.get('sec-ch-ua-platform-version')},client);
}
