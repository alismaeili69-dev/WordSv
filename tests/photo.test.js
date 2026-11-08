import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placement, isStoryPhoto, STORY_W, STORY_H } from '../src/photo.js';

test('portrait camera photo fills the 9:16 story', () => {
  const p = placement(3024, 4032, STORY_W, STORY_H, 'cover');
  assert.ok(p.w >= STORY_W - 0.5 && p.h >= STORY_H - 0.5);
  assert.ok(Math.abs(p.x + p.w / 2 - STORY_W / 2) < 1); // centred horizontally
});

test('landscape photo in "whole photo" mode fits inside', () => {
  const p = placement(4032, 3024, STORY_W, STORY_H, 'contain');
  assert.ok(p.w <= STORY_W + 0.5 && p.h <= STORY_H + 0.5);
  assert.ok(Math.abs(p.y + p.h / 2 - STORY_H / 2) < 1);
});

test('moving the crop up/down stays inside the photo', () => {
  const top = placement(3000, 6000, STORY_W, STORY_H, 'cover', 0);
  const bottom = placement(3000, 6000, STORY_W, STORY_H, 'cover', 1);
  assert.equal(top.y, 0);
  assert.ok(Math.abs(bottom.y + bottom.h - STORY_H) < 1);
});

test('only small JPEG data URLs are accepted as story photos', () => {
  assert.ok(isStoryPhoto('data:image/jpeg;base64,AAAA'));
  assert.ok(!isStoryPhoto('javascript:alert(1)'));
  assert.ok(!isStoryPhoto('data:image/svg+xml;base64,AAAA'));
  assert.ok(!isStoryPhoto('data:image/jpeg;base64,' + 'A'.repeat(500000)));
  assert.ok(!isStoryPhoto(undefined));
});
