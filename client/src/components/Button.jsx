export default function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 border border-blue-600',
    secondary: 'bg-cyan-500 hover:bg-cyan-600 text-slate-950 shadow-cyan-200 border border-cyan-400',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 border border-emerald-600',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200 border border-amber-500',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-red-200 border border-red-600',
    ghost: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-slate-100'
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'w-full px-6 py-3 text-base'
  };
  return (
    <button
      className={`rounded-xl font-semibold shadow-sm transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
