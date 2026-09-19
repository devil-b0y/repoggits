import {projectSchema,type ProjectData} from './schema';

export const starterKits=[
 {name:'Web application',description:'Interfaces, APIs & a database',languages:'JavaScript, TypeScript',frontend:'React',backend:'Node.js',database:'PostgreSQL',frameworks:'Next.js',tools:'VS Code',tags:['Next.js','TypeScript','PostgreSQL']},
 {name:'ESP32 / connected device',description:'Sensors, firmware & connected builds',languages:'C++, Python',frontend:'',backend:'',database:'',frameworks:'Arduino',tools:'Arduino IDE',tags:['ESP32','Arduino','IoT']},
 {name:'Data & machine learning',description:'Experiments, models & notebooks',languages:'Python',frontend:'',backend:'',database:'',frameworks:'scikit-learn',tools:'Jupyter Notebook',tags:['Python','Machine learning']},
 {name:'Mobile application',description:'An app that goes everywhere',languages:'Dart',frontend:'Flutter',backend:'',database:'',frameworks:'Flutter',tools:'Android Studio',tags:['Flutter','Dart']},
];
/** The technology answers a starter kit can suggest. The AI questions are always the maker's own answer. */
export const buildStackKeys=['languages','frontend','backend','database','frameworks','tools'] as const;
export function applyStarter(data:ProjectData,index:number):ProjectData{
 const kit=starterKits[index];if(!kit)return data;
 const stack={...data.stack};
 for(const key of buildStackKeys)if(!stack[key].trim())stack[key]=kit[key];
 return {...data,stack,tags:data.tags.length?data.tags:[...kit.tags]};
}
const sectionFor:Record<string,number>={title:1,subject:1,department:1,summary:1,description:1,type:1,features:1,teamName:2,team:2,startDate:2,endDate:2,year:2,tags:3,stack:3,github:3,liveUrl:3,videoUrl:3,services:3,coverId:4,galleryIds:4,sourceId:4,hardwareCosts:5,softwareCosts:5,currency:5,purchaseDate:5};
const labels:Record<string,string>={title:'Project title',teamName:'Team name',team:'Team member',stack:'Build stack',hardwareCosts:'Hardware costs',softwareCosts:'Software costs',endDate:'Development end',liveUrl:'Live demo URL',videoUrl:'Demo video URL',github:'GitHub URL'};
export function submissionIssues(data:ProjectData,changelog:string){
 const issues:{message:string;section:number}[]=[];
 const parsed=projectSchema.safeParse(data);
 if(!parsed.success)for(const issue of parsed.error.issues){const key=String(issue.path[0]);issues.push({section:sectionFor[key]||1,message:`${labels[key]||key}: ${issue.message}`});}
 const requirements:[boolean,string,number][]=[
  [data.subject.trim().length>0,'Choose a subject.',1],
  [data.summary.trim().length>=20,'Write a short description of at least 20 characters.',1],
  [data.description.trim().length>=50,'Tell your full story in at least 50 characters.',1],
  [data.team.length>0,'Add at least one team member.',2],
  [data.tags.length>0,'Add at least one technology tag.',3],
  [changelog.trim().length>=10&&changelog.trim().length<=5000,'Write a changelog between 10 and 5,000 characters.',6],
 ];
 for(const [valid,message,section] of requirements)if(!valid)issues.push({message,section});
 return issues;
}
