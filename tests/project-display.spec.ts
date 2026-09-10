import { test, expect } from '@playwright/test';
import { videoSource, projectDuration } from '../lib/project-display';
import { projectSchema, emptyProject } from '../lib/schema';

test('video embeds only use supported player hosts and safe media protocols',()=>{
  for(const url of ['https://youtu.be/aqz-KE-bpKQ','https://www.youtube.com/watch?v=aqz-KE-bpKQ','https://www.youtube.com/shorts/aqz-KE-bpKQ'])expect(videoSource(url)).toMatchObject({kind:'embed',url:expect.stringMatching(/^https:\/\/www.youtube-nocookie.com\/embed\/aqz-KE-bpKQ\?autoplay=1&mute=1/)});
  for(const url of ['javascript:alert(1)','https://youtube.com.evil.test/watch?v=aqz-KE-bpKQ','file:///movie.mp4','https://example.test/page'])expect(videoSource(url)).toBeNull();
  expect(videoSource('https://example.test/demo.webm?token=public')).toMatchObject({kind:'file'});
});

test('build duration handles same-day projects, leap years, incomplete and reversed dates',()=>{
  expect(projectDuration('2026-08-01','2026-08-15')).toBe('14 days');
  expect(projectDuration('2026-08-01','2026-08-01')).toBe('1 day');
  expect(projectDuration('2024-02-28','2024-03-01')).toBe('2 days');
  expect(projectDuration('2026-08-15','2026-08-01')).toBe('');
  expect(projectDuration('2026-08-01','')).toBe('');
});

test('legacy projects receive safe defaults while invalid team and service data are rejected',()=>{
  const legacy={...emptyProject,services:undefined,team:[{name:'Maker',email:'maker@example.test',contribution:'Developer'}]};
  expect(projectSchema.parse(legacy)).toMatchObject({services:[],team:[{college:'',semester:'',branch:'',photoId:''}]});
  expect(projectSchema.safeParse({...legacy,team:[{...legacy.team[0],college:'Unknown',semester:'9'}]}).success).toBe(false);
  expect(projectSchema.safeParse({...legacy,services:[{name:'Cloud',url:'javascript:alert(1)'}]}).success).toBe(false);
});
