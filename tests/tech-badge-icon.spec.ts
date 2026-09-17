import { test, expect } from '@playwright/test';
import { tagIconFor } from '../components/platform/Detail';
import { HardDrive, GraduationCap, Cloud, Tag } from 'lucide-react';

test('tag icon fallback matches storage, productivity and cloud keywords, defaulting to a generic tag icon',()=>{
  expect(tagIconFor('LocalStorage')).toBe(HardDrive);
  expect(tagIconFor('Session storage')).toBe(HardDrive);
  expect(tagIconFor('Student productivity')).toBe(GraduationCap);
  expect(tagIconFor('Cloud hosting')).toBe(Cloud);
  expect(tagIconFor('Something totally unrelated')).toBe(Tag);
});
