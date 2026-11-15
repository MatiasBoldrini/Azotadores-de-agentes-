const MAX_PRESS_MS = 300;
const MAX_MOVEMENT_PX = 4;

type Pointer = Pick<PointerEvent, 'button' | 'clientX' | 'clientY' | 'isPrimary' | 'pointerId' | 'timeStamp'>;
type Point = Pick<Pointer, 'clientX' | 'clientY'>;
type Press = Point & Pick<Pointer, 'pointerId' | 'timeStamp'> & {released: boolean};

export function createStationClickGuard() {
 let press: Press | null = null;
 const movedAway = (start: Point, event: Point) =>
  Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) > MAX_MOVEMENT_PX;

 return {
  start(event: Pointer) {
   press = event.isPrimary && event.button === 0 ? {
    clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId,
    timeStamp: event.timeStamp, released: false,
   } : null;
  },
  move(event: Pointer & {getCoalescedEvents?: () => Pointer[]}) {
   const start = press;
   if (!start || start.released || start.pointerId !== event.pointerId) return;
   if (movedAway(start, event) || event.getCoalescedEvents?.().some(sample => movedAway(start, sample))) {
    press = null;
   }
  },
  release(event: Pointer) {
   if (!press || press.pointerId !== event.pointerId) return;
   if (event.button !== 0 || event.timeStamp - press.timeStamp > MAX_PRESS_MS || movedAway(press, event)) {
    press = null;
    return;
   }
   press.released = true;
  },
  leave() {
   // A touch can leave the canvas between its pointerup and click.
   if (!press?.released) press = null;
  },
  cancel() {
   press = null;
  },
  consume(event: Pick<MouseEvent, 'button' | 'detail'> & {pointerId?: number}) {
   const start = press;
   press = null;
   return Boolean(start?.released && event.button === 0 && event.detail > 0 &&
    (event.pointerId === undefined || event.pointerId === start.pointerId));
  },
 };
}
