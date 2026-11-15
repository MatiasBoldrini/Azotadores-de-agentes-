import {useCallback, useId, useLayoutEffect, useRef, useState} from 'react';
import type {KeyboardEvent} from 'react';
import {CalendarDays, ChevronLeft, ChevronRight, X} from 'lucide-react';
import './DateWindowPicker.css';

type Endpoint = 'start' | 'end';
type ActiveEndpoint = {endpoint: Endpoint; trigger: HTMLButtonElement};
type CachedDay = {date: string; timestamp: string};
type Props = {
  compact?: boolean;
  days: string[];
  start: string;
  end: string;
  label: string;
  onChange: (start: string, end: string) => void;
  status: 'loading' | 'error' | null;
};

const formatDate = (timestamp: string) => new Date(timestamp).toISOString().slice(0, 10);
const utcDate = (day: string) => new Date(`${day}T00:00:00Z`);
const monthLabel = new Intl.DateTimeFormat('en', {month: 'long', year: 'numeric', timeZone: 'UTC'});
const dayLabel = new Intl.DateTimeFormat('en', {dateStyle: 'full', timeZone: 'UTC'});
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const viewportPadding = 8;
const triggerGap = 6;
const shiftDay = (day: string, offset: number) => {
  const date = utcDate(day);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

export default function DateWindowPicker({days, start, end, label, onChange, status, compact = false}: Props) {
  const dialogId = useId();
  const startDate = formatDate(start);
  const endDate = formatDate(end);
  const [active, setActive] = useState<ActiveEndpoint | null>(null);
  const [adjustment, setAdjustment] = useState<{endpoint: Endpoint; timestamp: string} | null>(null);
  const announcement = adjustment && adjustment.timestamp === (adjustment.endpoint === 'start' ? start : end)
    ? `${adjustment.endpoint === 'start' ? 'Start' : 'End'} date moved to ${dayLabel.format(new Date(adjustment.timestamp))} UTC.`
    : '';

  function select(timestamp: string) {
    if (timestamp === (active?.endpoint === 'start' ? start : end)) return;
    const index = days.indexOf(timestamp);
    if (active?.endpoint === 'start') {
      const cross = Date.parse(timestamp) >= Date.parse(end);
      const nextEnd = cross ? days[index + 1] : end;
      onChange(timestamp, nextEnd);
      if (cross) setAdjustment({endpoint: 'end', timestamp: nextEnd});
    } else {
      const cross = Date.parse(timestamp) <= Date.parse(start);
      const nextStart = cross ? days[index - 1] : start;
      onChange(nextStart, timestamp);
      if (cross) setAdjustment({endpoint: 'start', timestamp: nextStart});
    }
  }

  const close = useCallback((restoreFocus = true) => {
    setActive(null);
    if (restoreFocus) active?.trigger.focus({preventScroll: true});
  }, [active]);

  function toggle(endpoint: Endpoint, trigger: HTMLButtonElement) {
    if (status === 'loading') return;
    if (active?.endpoint === endpoint) {
      close();
      return;
    }
    setAdjustment(null);
    setActive({endpoint, trigger});
  }

  return (
    <div className={`utc-date-window${compact ? ' utc-date-window-compact' : ''}`}>
      <div className="date-pair" role="group" aria-label={label}>
        <button
          type="button" className="utc-date-trigger" aria-haspopup="dialog" aria-disabled={status === 'loading'}
          aria-expanded={active?.endpoint === 'start'} aria-controls={active?.endpoint === 'start' ? dialogId : undefined}
          onClick={event => toggle('start', event.currentTarget)}
        >
          <span className={compact ? 'utc-calendar-sr' : undefined}>From · UTC</span>
          <span><time dateTime={startDate}>{startDate}</time>{compact && ' UTC'}<CalendarDays size={12} aria-hidden="true"/></span>
        </button>
        <button
          type="button" className="utc-date-trigger" aria-haspopup="dialog" aria-disabled={status === 'loading'}
          aria-expanded={active?.endpoint === 'end'} aria-controls={active?.endpoint === 'end' ? dialogId : undefined}
          onClick={event => toggle('end', event.currentTarget)}
        >
          <span className={compact ? 'utc-calendar-sr' : undefined}>Until · UTC</span>
          <span><time dateTime={endDate}>{endDate}</time>{compact && ' UTC'}<CalendarDays size={12} aria-hidden="true"/></span>
        </button>
        <span className="utc-calendar-sr" role="status">{announcement}</span>
        {active && (
          <DayCalendar
            key={active.endpoint}
            id={dialogId}
            trigger={active.trigger}
            title={active.endpoint === 'start' ? 'Choose a start date (UTC)' : 'Choose an end date (UTC)'}
            value={active.endpoint === 'start' ? startDate : endDate}
            days={(active.endpoint === 'start' ? days.slice(0, -1) : days.slice(1))
              .map(timestamp => ({timestamp, date: formatDate(timestamp)}))}
            onSelect={select}
            onClose={close}
          />
        )}
      </div>
      {status && <p className="micro" role="status">{status === 'loading'
        ? 'Loading cached observations…'
        : 'Could not load that window. Choose the date again to retry.'}</p>}
    </div>
  );
}

function DayCalendar({id, trigger, title, value, days, onSelect, onClose}: {
  id: string;
  trigger: HTMLButtonElement;
  title: string;
  value: string;
  days: CachedDay[];
  onSelect: (timestamp: string) => void;
  onClose: (restoreFocus?: boolean) => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const dayButton = useRef<HTMLButtonElement>(null);
  const focusDay = useRef(true);
  const [focused, setFocused] = useState(() => days.find(day => day.date === value)?.date ?? days[0].date);
  const month = focused.slice(0, 7);
  const months = [...new Set(days.map(day => day.date.slice(0, 7)))];
  const monthIndex = months.indexOf(month);
  const firstOfMonth = `${month}-01`;
  const firstWeekday = utcDate(firstOfMonth).getUTCDay();
  const monthDays = days.filter(day => day.date.startsWith(month));
  const lastOfMonth = utcDate(firstOfMonth);
  lastOfMonth.setUTCMonth(lastOfMonth.getUTCMonth() + 1, 0);
  const dayCount = lastOfMonth.getUTCDate();

  useLayoutEffect(() => {
    const popup = dialog.current!;
    const viewport = window.visualViewport;
    function position() {
      const left = (viewport?.offsetLeft ?? 0) + viewportPadding;
      const top = (viewport?.offsetTop ?? 0) + viewportPadding;
      const right = left + (viewport?.width ?? document.documentElement.clientWidth) - 2 * viewportPadding;
      const bottom = top + (viewport?.height ?? document.documentElement.clientHeight) - 2 * viewportPadding;
      const anchor = trigger.getBoundingClientRect();
      popup.style.maxWidth = `${right - left}px`;
      popup.style.maxHeight = `${bottom - top}px`;
      const {width, height} = popup.getBoundingClientRect();
      const below = anchor.bottom + triggerGap;
      const above = anchor.top - triggerGap;
      const preferredTop = below + height > bottom && above - top > bottom - below
        ? above - height
        : below;
      popup.style.left = `${Math.max(left, Math.min(anchor.left, right - width))}px`;
      popup.style.top = `${Math.max(top, Math.min(preferredTop, bottom - height))}px`;
    }
    function dismissOutside(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node) || popup.contains(target) || trigger.contains(target)) return;
      const focusedElement = document.activeElement;
      onClose(popup.contains(focusedElement) || focusedElement === document.body);
    }
    function dismissWithEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    }

    if (popup.showPopover && !popup.matches(':popover-open')) popup.showPopover();
    position();
    const observer = new ResizeObserver(position);
    observer.observe(popup);
    observer.observe(trigger);
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    viewport?.addEventListener('scroll', position);
    viewport?.addEventListener('resize', position);
    document.addEventListener('click', dismissOutside, true);
    document.addEventListener('keydown', dismissWithEscape);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
      viewport?.removeEventListener('scroll', position);
      viewport?.removeEventListener('resize', position);
      document.removeEventListener('click', dismissOutside, true);
      document.removeEventListener('keydown', dismissWithEscape);
    };
  }, [trigger, onClose]);
  useLayoutEffect(() => {
    if (!focusDay.current) return;
    dayButton.current?.focus();
    focusDay.current = false;
  }, [focused]);

  function moveTo(day: string | undefined, focus: boolean) {
    if (!day || day === focused) return;
    focusDay.current = focus;
    setFocused(day);
  }

  function changeMonth(offset: number, focus: boolean) {
    const targetMonth = months[monthIndex + offset];
    if (!targetMonth) return;
    const options = days.filter(day => day.date.startsWith(targetMonth));
    const target = options.find(day => day.date.slice(-2) >= focused.slice(-2)) ?? options.at(-1);
    moveTo(target?.date, focus);
  }

  function handleDayKey(event: KeyboardEvent<HTMLButtonElement>) {
    const position = days.findIndex(day => day.date === focused);
    const weekday = utcDate(focused).getUTCDay();
    const firstOnOrAfter = (date: string) => days.find(day => day.date >= date)?.date;
    const lastOnOrBefore = (date: string) => [...days].reverse().find(day => day.date <= date)?.date;
    let target: string | undefined;
    switch (event.key) {
      case 'ArrowLeft': target = days[position - 1]?.date; break;
      case 'ArrowRight': target = days[position + 1]?.date; break;
      case 'ArrowUp': target = lastOnOrBefore(shiftDay(focused, -7)); break;
      case 'ArrowDown': target = firstOnOrAfter(shiftDay(focused, 7)); break;
      case 'Home': target = firstOnOrAfter(shiftDay(focused, -weekday)); break;
      case 'End': target = lastOnOrBefore(shiftDay(focused, 6 - weekday)); break;
      case 'PageUp': changeMonth(-1, true); break;
      case 'PageDown': changeMonth(1, true); break;
      default: return;
    }
    event.preventDefault();
    moveTo(target, true);
  }

  return (
    <div
      id={id} className="utc-calendar-dialog" ref={dialog} role="dialog" popover="manual"
      aria-labelledby={`${id}-title`}
    >
      <div className="utc-calendar">
        <div className="utc-calendar-header">
          <h2 id={`${id}-title`}>{title}</h2>
          <button type="button" aria-label="Close calendar" onClick={() => onClose()}>
            <X size={16} aria-hidden="true"/>
          </button>
        </div>
        <div className="utc-calendar-header">
          <button type="button" aria-label="Previous month" aria-disabled={monthIndex === 0}
            onClick={() => changeMonth(-1, false)}>
            <ChevronLeft size={16} aria-hidden="true"/>
          </button>
          <h3 id={`${id}-month`} aria-live="polite">{monthLabel.format(utcDate(firstOfMonth))}</h3>
          <button type="button" aria-label="Next month" aria-disabled={monthIndex === months.length - 1}
            onClick={() => changeMonth(1, false)}>
            <ChevronRight size={16} aria-hidden="true"/>
          </button>
        </div>
        <table role="grid" aria-labelledby={`${id}-month`}>
          <thead><tr>{weekdays.map(day => <th key={day} scope="col" aria-label={day}>{day.slice(0, 2)}</th>)}</tr></thead>
          <tbody>
            {Array.from({length: Math.ceil((firstWeekday + dayCount) / 7)}, (_, week) => (
              <tr key={week}>
                {weekdays.map((weekday, column) => {
                  const number = week * 7 + column - firstWeekday + 1;
                  if (number < 1 || number > dayCount) return <td key={weekday}/>;
                  const date = `${month}-${String(number).padStart(2, '0')}`;
                  const day = monthDays.find(item => item.date === date);
                  return (
                    <td key={weekday} aria-selected={day ? date === value : undefined}>
                      <button
                        type="button" disabled={!day} aria-label={dayLabel.format(utcDate(date))}
                        tabIndex={date === focused ? 0 : -1}
                        ref={date === focused ? dayButton : undefined}
                        onKeyDown={handleDayKey}
                        onClick={() => {
                          if (!day) return;
                          onSelect(day.timestamp);
                          onClose();
                        }}
                      >{number}</button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
