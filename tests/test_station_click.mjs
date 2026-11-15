import assert from 'node:assert/strict';
import test from 'node:test';
import {createStationClickGuard} from '../frontend/src/lib/stationClick.ts';

const pointer = (changes = {}) => ({
 button: 0, clientX: 20, clientY: 40, isPrimary: true, pointerId: 9, timeStamp: 1000, ...changes,
});
const click = {button: 0, detail: 1, pointerId: 9};

test('a brief click permits a few pixels of jitter and can only select once', () => {
 const guard = createStationClickGuard();
 guard.start(pointer());
 guard.move(pointer({clientX: 22, clientY: 42, timeStamp: 1050}));
 guard.release(pointer({clientX: 22, clientY: 42, timeStamp: 1100}));
 assert.equal(guard.consume(click), true);
 assert.equal(guard.consume(click), false);
});

test('a stationary long press cannot select', () => {
 const guard = createStationClickGuard();
 guard.start(pointer());
 guard.release(pointer({timeStamp: 1301}));
 assert.equal(guard.consume(click), false);
});

test('a drag that returns to its starting point cannot select', () => {
 const guard = createStationClickGuard();
 guard.start(pointer());
 guard.move(pointer({clientX: 44, timeStamp: 1020}));
 guard.move(pointer({timeStamp: 1040}));
 guard.release(pointer({timeStamp: 1060}));
 assert.equal(guard.consume(click), false);
});

test('a displaced release or coalesced movement also counts as a drag', () => {
 const guard = createStationClickGuard();
 guard.start(pointer());
 guard.release(pointer({clientX: 30, timeStamp: 1050}));
 assert.equal(guard.consume(click), false);

 guard.start(pointer());
 guard.move(pointer({getCoalescedEvents: () => [pointer({clientX: 30}), pointer()]}));
 guard.release(pointer({timeStamp: 1050}));
 assert.equal(guard.consume(click), false);
});

test('leaving or cancelling while pressed prevents selection', () => {
 for (const cancellation of ['leave', 'cancel']) {
  const guard = createStationClickGuard();
  guard.start(pointer());
  guard[cancellation]();
  guard.release(pointer({timeStamp: 1050}));
  assert.equal(guard.consume(click), false);
 }
});

test('a touch may leave after release before its click is delivered', () => {
 const guard = createStationClickGuard();
 guard.start(pointer());
 guard.release(pointer({timeStamp: 1050}));
 guard.leave();
 assert.equal(guard.consume(click), true);
});

test('secondary buttons, additional touches and unrelated clicks cannot select', () => {
 const guard = createStationClickGuard();
 guard.start(pointer({button: 2}));
 guard.release(pointer({timeStamp: 1050, button: 2}));
 assert.equal(guard.consume(click), false);

 guard.start(pointer());
 guard.start(pointer({isPrimary: false, pointerId: 10}));
 guard.release(pointer({timeStamp: 1050}));
 assert.equal(guard.consume(click), false);

 guard.start(pointer());
 guard.release(pointer({timeStamp: 1050}));
 assert.equal(guard.consume({...click, pointerId: 10}), false);

 guard.start(pointer());
 guard.release(pointer({timeStamp: 1050}));
 assert.equal(guard.consume({...click, detail: 0}), false);
});
