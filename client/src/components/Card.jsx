export default function Card({ children, className = '' }) {
  const hasOverflowClass = /\boverflow(?:-[xy])?-[^\s]+/.test(className);

  return (
    <div className={`bg-white rounded-2xl shadow-lg border border-slate-100 ${hasOverflowClass ? '' : 'overflow-hidden'} ${className}`}>
      {children}
    </div>
  );
}
