import {useId, useLayoutEffect, useRef, useState} from 'react';
import type {KeyboardEvent} from 'react';
import {CalendarDays, ChevronLeft, ChevronRight, X} from 'lucide-react';
import './DateWindowPicker.css';

type Endpoint = 'start' | 'end';
type CachedDay = {date: string; timestamp: string};
type Props = {
  days: string[];
  start: string;
  end: string;
  label: string;
  onChange: (start: string, end: string) => void;
};

const formatDate = (timestamp: string) => new Date(timestamp).toISOString().slice(0, 10);
const utcDate = (day: string) => new Date(`${day}T00:00:00Z`);
const monthLabel = new Intl.DateTimeFormat('en', {month: 'long', year: 'numeric', timeZone: 'UTC'});
const dayLabel = new Intl.DateTimeFormat('en', {dateStyle: 'full', timeZone: 'UTC'});
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const shiftDay = (day: string, offset: number) => {
  const date = utcDate(day);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

export default function DateWindowPicker({days, start, end, label, onChange}: Props) {
  const dialogId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const startDate = formatDate(start);
  const endDate = formatDate(end);
  const [active, setActive] = useState<Endpoint | null>(null);
  const [announcement, setAnnouncement] = useState('');

  function select(timestamp: string) {
    if (timestamp === (active === 'start' ? start : end)) return;
    const index = days.indexOf(timestamp);
    if (active === 'start') {
      const cross = Date.parse(timestamp) >= Date.parse(end);
      const nextEnd = cross ? days[index + 1] : end;
      onChange(timestamp, nextEnd);
      if (cross) setAnnouncement(`End date moved to ${dayLabel.format(new Date(nextEnd))} UTC.`);
    } else {
      const cross = Date.parse(timestamp) <= Date.parse(start);
      const nextStart = cross ? days[index - 1] : start;
      onChange(nextStart, timestamp);
      if (cross) setAnnouncement(`Start date moved to ${dayLabel.format(new Date(nextStart))} UTC.`);
    }
  }

  function open(endpoint: Endpoint, button: HTMLButtonElement) {
    trigger.current = button;
    setAnnouncement('');
    setActive(endpoint);
  }

  function close() {
    setActive(null);
    trigger.current?.focus();
  }

  return (
    <div className="date-pair" role="group" aria-label={label}>
      <button
        type="button" className="utc-date-trigger" aria-haspopup="dialog"
        aria-expanded={active === 'start'} aria-controls={active === 'start' ? dialogId : undefined}
        onClick={event => open('start', event.currentTarget)}
      >
        <span>From · UTC</span>
        <span><time dateTime={startDate}>{startDate}</time><CalendarDays size={12} aria-hidden="true"/></span>
      </button>
      <button
        type="button" className="utc-date-trigger" aria-haspopup="dialog"
        aria-expanded={active === 'end'} aria-controls={active === 'end' ? dialogId : undefined}
        onClick={event => open('end', event.currentTarget)}
      >
        <span>Until · UTC</span>
        <span><time dateTime={endDate}>{endDate}</time><CalendarDays size={12} aria-hidden="true"/></span>
      </button>
      <span className="utc-calendar-sr" role="status">{announcement}</span>
      {active && (
        <DayCalendar
          id={dialogId}
          title={active === 'start' ? 'Choose a start date (UTC)' : 'Choose an end date (UTC)'}
          value={active === 'start' ? startDate : endDate}
          days={(active === 'start' ? days.slice(0, -1) : days.slice(1))
            .map(timestamp => ({timestamp, date: formatDate(timestamp)}))}
          onSelect={select}
          onClose={close}
        />
      )}
    </div>
  );
}

function DayCalendar({id, title, value, days, onSelect, onClose}: {
  id: string;
  title: string;
  value: string;
  days: CachedDay[];
  onSelect: (timestamp: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
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
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);
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
    <dialog
      id={id} className="utc-calendar-dialog" ref={dialog} aria-labelledby={`${id}-title`}
      onClose={onClose} onClick={event => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
    >
      <div className="utc-calendar">
        <div className="utc-calendar-header">
          <h2 id={`${id}-title`}>{title}</h2>
          <button type="button" aria-label="Close calendar" onClick={() => dialog.current?.close()}>
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
                          dialog.current?.close();
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
    </dialog>
  );
}
