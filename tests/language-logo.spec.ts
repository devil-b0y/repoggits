import { test, expect } from '@playwright/test';
import { findLanguageLogo } from '../components/platform/Detail';

test('language logo lookup matches names and aliases regardless of case, and falls back for unknown languages',()=>{
  expect(findLanguageLogo('JavaScript')).toBe('/images/languages/javascript.svg');
  expect(findLanguageLogo('javascript')).toBe('/images/languages/javascript.svg');
  expect(findLanguageLogo('js')).toBe('/images/languages/javascript.svg');
  expect(findLanguageLogo('HTML')).toBe('/images/languages/html5.svg');
  expect(findLanguageLogo('html5')).toBe('/images/languages/html5.svg');
  expect(findLanguageLogo('CSS')).toBe('/images/languages/css3.svg');
  expect(findLanguageLogo('css3')).toBe('/images/languages/css3.svg');
  expect(findLanguageLogo('Not A Real Language')).toBeUndefined();
});
