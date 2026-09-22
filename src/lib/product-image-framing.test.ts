import { test } from 'node:test';
import assert from 'node:assert/strict';
import frames from './product-image-frames.json';
import {
  fitProductFrame,
  imageFrameKey,
  productImageStyle,
} from './product-image-framing';

test('portrait, landscape and off-center photos keep their proportions and fit an 82% content area', () => {
  for (const frame of [
    [1200, 1200, 400, 100, 400, 900],
    [1200, 800, 50, 200, 1000, 300],
    [640, 1280, 0, 0, 640, 1280],
  ]) {
    const [w, h, x, y, cw, ch] = frame;
    const fit = fitProductFrame(frame)!;
    assert.ok(fit);
    assert.ok(Math.abs(fit.width / fit.height - w / h) < 0.00001);
    const scale = fit.width / w;
    assert.ok(Math.abs(Math.max(cw, ch) * scale - 82) < 0.00001);
    assert.ok(Math.abs(fit.left + (x + cw / 2) * scale - 50) < 0.00001);
    assert.ok(Math.abs(fit.top + (y + ch / 2) * scale - 50) < 0.00001);
  }
});
test('unknown or invalid images retain safe contain framing', () => {
  assert.equal(fitProductFrame([10, 10, 0, 0, 100, 100]), null);
  assert.equal(fitProductFrame([0, 0, 0, 0, 0, 0]), null);
  assert.equal(productImageStyle('/new-image.jpg').objectFit, 'contain');
});
test('BigCommerce variants use identical content framing', () => {
  assert.equal(
    imageFrameKey('https://cdn.example/p.350.350.jpg'),
    imageFrameKey('https://cdn.example/p.1280.1280.jpg'),
  );
});

test('every catalog frame has valid bounds and keeps all detected content visible', () => {
  for (const [url, frame] of Object.entries(frames)) {
    const fit = fitProductFrame(frame);
    assert.ok(fit, url);
    const [w, , x, y, cw, ch] = frame;
    const scale = fit.width / w;
    assert.ok(fit.left + x * scale >= 0, url);
    assert.ok(fit.top + y * scale >= 0, url);
    assert.ok(fit.left + (x + cw) * scale <= 100, url);
    assert.ok(fit.top + (y + ch) * scale <= 100, url);
  }
});
