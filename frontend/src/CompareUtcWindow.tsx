const compareTimestamp = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
});

export default function CompareUtcWindow({ start, end }: { start: string; end: string }) {
  return <span className="compare-utc-window">
    <time dateTime={start}>{compareTimestamp.format(new Date(start))}</time>
    {' to '}
    <time dateTime={end}>{compareTimestamp.format(new Date(end))}</time>
    {' UTC'}
  </span>;
}
