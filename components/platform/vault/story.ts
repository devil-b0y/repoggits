export const chapters = [
  {id:'story',label:'The spark',title:'Something worth building.',body:'Every great thing begins with a small idea.'},
  {id:'student',label:'After hours',title:'The world sleeps.\nYou build.',body:'A notebook. A circuit. One more line of code. This is where it begins.'},
  {id:'scattered',label:'The reality',title:'Too many ideas.\nToo many places.',body:'Too much to remember.'},
  {id:'question',label:'A little possibility',title:'What if everything\nhad a place?',body:''},
  {id:'vault',label:'Meet Project Vault',title:'A home for\nwhat you build.',body:'Your ideas deserve more than another forgotten folder.'},
  {id:'how-it-works',label:'Open possibilities',title:'Made to hold\nyour whole process.',body:'Bring the code, the team, the details, and the lessons. Give your work a place to grow.'},
  {id:'organized',label:'Everything, together',title:'From scattered.\nTo structured.\nTo yours.',body:'The story behind the build, finally in one place.'},
  {id:'learning',label:'Progress is a process',title:'Build. Fail. Learn.\nBuild again.',body:'Every failure becomes part of the journey. Keep the changes. Share what you learned.'},
  {id:'protection',label:'What you build matters',title:'Protect\nwhat matters.',body:'Share deliberately. Keep a version history. Give every contribution its place.'},
  {id:'connection',label:'Beyond your desk',title:'What you build\ndoesn’t have to\nstay invisible.',body:'One connection becomes a new possibility.'},
  {id:'about',label:'The bigger picture',title:'Built by people.\nConnected by ideas.',body:'A collective home for student engineering. Software, hardware, and everything in between.'},
  {id:'morning',label:'A new day',title:'Close the laptop.\nKeep the possibility.',body:'The work stays. The story continues.'},
  {id:'brand',label:'Project Vault / by repoggits',title:'Where ideas\nfind a place.',body:''},
  {id:'enter',label:'Your next chapter',title:'Your next idea\nstarts here.',body:'Make something worth passing on.'},
] as const;
export const clamp=(n:number,min=0,max=1)=>Math.max(min,Math.min(max,n));
